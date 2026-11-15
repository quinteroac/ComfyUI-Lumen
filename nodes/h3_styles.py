"""Style codes and weighted prompt segments for MiniMax H3 Image.

From ComfyUI-MiniMax-H3-Concept-Sliders (MIT, quinteroac): the concept patch of its Concept Slider and Style Code
nodes, with the inputs Lumen uses. Each concept is encoded on its own and appended to the positive prompt, and its
share of attention is scaled per token.
"""
import math

import torch

import comfy.conds
import comfy.patcher_extension
from comfy_api.latest import io

from .style_codes import listing, load_styles, mix_styles, parse_codes

BIAS_KEY = "lumen_h3_concept_bias"
WEIGHT_KEY = "lumen_h3_concept_weight"
# H3 Image's own per text token tags, extended with the concept's tokens.
TAGS_KEY = "minimax_token_tags"
# Per text token arrays and their value for tokens that are not a concept.
NEUTRAL = {BIAS_KEY: 0.0, WEIGHT_KEY: 1.0}
# H3 Image presents the raw prompt with no chat template, so the first token of a text encoded alone
# takes the causal LM's attention sink role. The concept is encoded as ", concept" and the comma is dropped.
SINK_TOKENS = 1
TEXT_TAG = 1
STYLES = load_styles("styles.json")


def extra_conds_with_concept(original, cond, values):
    def extra_conds(**kwargs):
        context = kwargs.get("cross_attn")
        if kwargs.get("prompt_type") != "positive" or context is None:
            return original(**kwargs)
        # Same place as writing ", concept" at the end of the prompt; the token refiner reads both together.
        split = context.shape[1]
        kwargs["cross_attn"] = torch.cat((context, cond.to(context)), dim=1)
        tags = kwargs.get(TAGS_KEY)
        if tags is not None:
            kwargs[TAGS_KEY] = torch.cat((tags, torch.full((cond.shape[1],), TEXT_TAG, dtype=tags.dtype, device=tags.device)))
        for key, neutral in NEUTRAL.items():
            array = kwargs.get(key)
            value = values.get(key, neutral)
            if array is None and value == neutral:
                continue
            if array is None:
                array = torch.full((1, split), neutral)
            kwargs[key] = torch.cat((array, torch.full((1, cond.shape[1]), value, dtype=array.dtype, device=array.device)), dim=1)
        out = original(**kwargs)
        # An earlier node's patch has already extended the arrays it received with its own concept.
        for key in NEUTRAL:
            if key in kwargs and key not in out:
                out[key] = comfy.conds.CONDRegular(kwargs[key])
        return out
    return extra_conds


def concept_attention(previous, bias, weight):
    def override(func, q, k, v, *args, **kwargs):
        # The packed sequence starts with the text, so the per text token arrays pad out over the references and the image.
        rest = k.shape[2] - (bias if bias is not None else weight).shape[1]
        if bias is not None:
            # log(w) on the logits multiplies the concept's share of attention by w before softmax renormalizes.
            mask = torch.nn.functional.pad(bias.to(q), (0, rest))[:, None, None, :]
            kwargs["mask"] = mask if kwargs.get("mask") is None else kwargs["mask"] + mask

        def attention(v):
            if previous is not None:
                return previous(func, q, k, v, *args, **kwargs)
            return func(q, k, v, *args, **kwargs)
        if weight is None:
            return attention(v)
        scale = torch.nn.functional.pad(weight.to(v), (0, rest), value=1.0)[:, None, :, None]
        out = attention(v * scale)
        # The concepts as written set the magnitude, so the weights only turn each head's output.
        # The backend returns the heads concatenated, [b, s, heads * dim_head].
        heads = args[0]
        reference = attention(v).unflatten(-1, (heads, -1))
        out = out.unflatten(-1, (heads, -1))
        return (out * (reference.norm(dim=-1, keepdim=True) / out.norm(dim=-1, keepdim=True).clamp(min=1e-6))).flatten(-2)
    return override


def concept_attention_wrapper(executor, x, timestep, context, transformer_options, **kwargs):
    bias = kwargs.pop(BIAS_KEY, None)
    weight = kwargs.pop(WEIGHT_KEY, None)
    if bias is not None or weight is not None:
        transformer_options = {**transformer_options, "optimized_attention_override": concept_attention(transformer_options.get("optimized_attention_override"), bias, weight)}
    return executor(x, timestep, context, transformer_options, **kwargs)


def encode_concept(clip, concept):
    cond = clip.encode_from_tokens_scheduled(clip.tokenize(", " + concept), show_pbar=False)[0][0]
    return cond[:, SINK_TOKENS:].clone()


def apply_concepts(model, clip, weighted, mode):
    patched = model.clone()
    patched.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WEIGHT_KEY, concept_attention_wrapper)
    for concept, strength in weighted:
        values = {BIAS_KEY: math.log(strength)} if mode == "attention" else {WEIGHT_KEY: strength}
        patched.add_object_patch("extra_conds", extra_conds_with_concept(patched.get_model_object("extra_conds"), encode_concept(clip, concept), values))
    return patched


class LumenH3ConceptSlider(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenH3ConceptSlider",
            display_name="Lumen H3 Image Concept Slider",
            category="Lumen",
            description="Adds a concept to the end of the positive prompt with its own strength (Lumen's a::2 weights).",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip", tooltip="The MiniMax H3 CLIP that encodes the prompts."),
                io.String.Input("concept", default=""),
                io.Combo.Input("mode", options=["attention", "weight_norm"], tooltip="attention scales how much the image attends to the concept, weight_norm scales the concept's attention values and keeps each output at its magnitude as written."),
                io.Float.Input("strength", default=1.0, min=0.0, max=100.0, step=0.05),
            ],
            outputs=[io.Model.Output()],
        )

    @classmethod
    def execute(cls, model, clip, concept, mode, strength):
        if strength == 0 or not concept.strip():
            return io.NodeOutput(model)
        return io.NodeOutput(apply_concepts(model, clip, [(concept.strip(), strength)], mode))


class LumenH3StyleCode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenH3StyleCode",
            display_name="Lumen H3 Image Style Code",
            category="Lumen",
            description="--sref style codes: each code picks a few styles with random weights and adds them to the positive prompt.",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip", tooltip="The MiniMax H3 CLIP that encodes the prompts."),
                io.String.Input("codes", default="", tooltip="Style codes with an optional ::weight, like 123 456::0.5."),
                io.Int.Input("styles_per_code", default=4, min=1, max=8),
                io.Float.Input("strength", default=1.5, min=0.0, max=4.0, step=0.05, tooltip="How much the image attends to the styles, like --sw; 1 is as written."),
            ],
            outputs=[io.Model.Output(), io.String.Output(display_name="styles", tooltip="The styles the codes picked, with their weights.")],
        )

    @classmethod
    def execute(cls, model, clip, codes, styles_per_code, strength):
        styles = mix_styles(parse_codes(codes), STYLES, styles_per_code)
        if strength == 0 or not styles:
            return io.NodeOutput(model, listing(styles))
        return io.NodeOutput(apply_concepts(model, clip, [(style["text"], w * strength) for style, w in styles], "attention"), listing(styles))


NODES = [LumenH3ConceptSlider, LumenH3StyleCode]
