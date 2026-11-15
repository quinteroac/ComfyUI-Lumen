"""Style codes and weighted prompt segments for MOSS Image.

From ComfyUI-MOSS-Concept-Sliders (MIT, quinteroac): the concept patch of its Concept Slider and Style Code nodes,
with the inputs Lumen uses. Each concept is encoded on its own and inserted before the chat template closes the
prompt; MOSS Image reads the attention bias itself, the value weights go through an attention override.
"""
import math

import torch

import comfy.conds
import comfy.patcher_extension
from comfy_api.latest import io

from .style_codes import listing, load_styles, mix_styles, parse_codes

# MOSS Image's own per text token attention bias.
BIAS_KEY = "context_attention_bias"
WEIGHT_KEY = "lumen_moss_concept_weight"
NEUTRAL = {BIAS_KEY: 0.0, WEIGHT_KEY: 1.0}
# MOSS-Image wraps every prompt in "<|im_start|>user\n" ... "<|im_end|>\n<|im_start|>assistant\n<think>\n".
TEMPLATE_HEAD, TEMPLATE_TAIL = 3, 7
STYLES = load_styles("styles.json")


def extra_conds_with_concept(original, cond, values):
    def extra_conds(**kwargs):
        context = kwargs.get("cross_attn")
        if kwargs.get("prompt_type") != "positive" or context is None:
            return original(**kwargs)
        # Same layout as writing ", concept" at the end of the prompt, before the template closes the user turn.
        split = context.shape[1] - TEMPLATE_TAIL
        kwargs["cross_attn"] = torch.cat((context[:, :split], cond.to(context), context[:, split:]), dim=1)
        for key, neutral in NEUTRAL.items():
            array = kwargs.get(key)
            value = values.get(key, neutral)
            if array is None and value == neutral:
                continue
            if array is None:
                array = torch.full(context.shape[:2], neutral, device=context.device)
            concept = torch.full((array.shape[0], cond.shape[1]), value, dtype=array.dtype, device=array.device)
            kwargs[key] = torch.cat((array[:, :split], concept, array[:, split:]), dim=1)
        out = original(**kwargs)
        # MOSS-Image reads the bias itself, the weights go to the model through the attention wrapper.
        if WEIGHT_KEY in kwargs and WEIGHT_KEY not in out:
            out[WEIGHT_KEY] = comfy.conds.CONDRegular(kwargs[WEIGHT_KEY])
        return out
    return extra_conds


def concept_value_attention(previous, weight, image_len):
    def override(func, q, k, v, *args, **kwargs):
        def attention(v):
            if previous is not None:
                return previous(func, q, k, v, *args, **kwargs)
            return func(q, k, v, *args, **kwargs)
        # The text blocks see only the text, the joint blocks the image first, then the text and the references.
        start = 0 if k.shape[1] == weight.shape[1] else image_len
        scale = torch.nn.functional.pad(weight.to(v), (start, k.shape[1] - start - weight.shape[1]), value=1.0)
        out = attention(v * scale[..., None])
        # The concepts as written set the magnitude, so the weights only turn each output.
        reference = attention(v)
        return out * (reference.norm(dim=-1, keepdim=True) / out.norm(dim=-1, keepdim=True).clamp(min=1e-6))
    return override


def concept_attention_wrapper(executor, x, timestep, context, transformer_options, **kwargs):
    weight = kwargs.pop(WEIGHT_KEY, None)
    if weight is not None:
        transformer_options = {**transformer_options, "optimized_attention_override": concept_value_attention(transformer_options.get("optimized_attention_override"), weight, x.shape[-2] * x.shape[-1])}
    return executor(x, timestep, context, transformer_options, **kwargs)


def encode_concept(clip, concept):
    cond = clip.encode_from_tokens_scheduled(clip.tokenize(", " + concept), show_pbar=False)[0][0]
    return cond[:, TEMPLATE_HEAD:-TEMPLATE_TAIL].clone()


def apply_concepts(model, clip, weighted, mode):
    patched = model.clone()
    for concept, strength in weighted:
        if mode == "attention":
            # log(w) on the logits multiplies the concept's share of attention by w before softmax renormalizes.
            values = {BIAS_KEY: math.log(strength)}
        else:
            # The text is RMS-normed before every attention, so scaling the concept's states would cancel out; its values are scaled there instead.
            patched.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WEIGHT_KEY, concept_attention_wrapper)
            values = {WEIGHT_KEY: strength}
        patched.add_object_patch("extra_conds", extra_conds_with_concept(patched.get_model_object("extra_conds"), encode_concept(clip, concept), values))
    return patched


class LumenMOSSConceptSlider(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenMOSSConceptSlider",
            display_name="Lumen MOSS Image Concept Slider",
            category="Lumen",
            description="Adds a concept to the end of the positive prompt with its own strength (Lumen's a::2 weights).",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip", tooltip="The MOSS Image CLIP that encodes the prompts."),
                io.String.Input("concept", default=""),
                io.Combo.Input("mode", options=["attention", "weight_norm"], tooltip="attention scales how much the image attends to the concept, weight_norm scales the concept's attention values and keeps each output at its magnitude as written."),
                io.Float.Input("strength", default=1.0, min=0.0, max=1.5, step=0.05),
            ],
            outputs=[io.Model.Output()],
        )

    @classmethod
    def execute(cls, model, clip, concept, mode, strength):
        if strength == 0 or not concept.strip():
            return io.NodeOutput(model)
        return io.NodeOutput(apply_concepts(model, clip, [(concept.strip(), strength)], mode))


class LumenMOSSStyleCode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenMOSSStyleCode",
            display_name="Lumen MOSS Image Style Code",
            category="Lumen",
            description="--sref style codes: each code picks a few styles with random weights and adds them to the positive prompt.",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip", tooltip="The MOSS Image CLIP that encodes the prompts."),
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


NODES = [LumenMOSSConceptSlider, LumenMOSSStyleCode]
