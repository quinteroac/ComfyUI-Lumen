"""Style codes and weighted prompt segments for Anima.

From ComfyUI-Anima-Tag-Sliders (MIT, quinteroac): the tag patch of its Tag Slider and Style Code nodes, with the
inputs and modes Lumen uses. Each tag is encoded on its own and added to the prompt before the LLM adapter runs;
its cross-attention is biased or its values scaled per token.
"""
import math

import torch

import comfy.conds
import comfy.patcher_extension
from comfy_api.latest import io

from .style_codes import listing, load_artists, load_styles, mix_styles, parse_codes

BIAS_KEY = "lumen_anima_tag_bias"
SCALE_KEY = "lumen_anima_tag_scale"
STYLES = load_styles("anima_styles.json")
# Artists are drawn from the most trained ones; the rarest have little effect.
ARTISTS = load_artists("anima_artists.txt")[:5000]


def extra_conds_with_tag(original, cond, ids, weights, marks):
    """marks: (array key, neutral value, apply) for each per-token array that carries the tag."""
    def extra_conds(**kwargs):
        start = None
        if kwargs.get("prompt_type") == "positive" and kwargs.get("t5xxl_ids") is not None:
            # Same layout as writing the tag at the end of the prompt, before the adapter runs.
            prompt_ids, prompt_weights = kwargs["t5xxl_ids"], kwargs["t5xxl_weights"]
            start = len(prompt_ids) - 1
            kwargs["cross_attn"] = torch.cat((kwargs["cross_attn"], cond.to(kwargs["cross_attn"])), dim=1)
            kwargs["t5xxl_ids"] = torch.cat((prompt_ids[:-1], ids.to(prompt_ids), prompt_ids[-1:]))
            kwargs["t5xxl_weights"] = torch.cat((prompt_weights[:-1], weights.to(prompt_weights), prompt_weights[-1:]))
        out = original(**kwargs)
        if "c_crossattn" in out:
            for key, neutral, apply in marks:
                mark_tag(out, key, neutral, start, len(ids), apply)
        return out
    return extra_conds


def mark_tag(out, key, neutral, start, length, apply):
    """Writes the tag into a per-token array. Every prompt carries the array so positive and negative still batch together."""
    context = out["c_crossattn"].cond
    array = out[key].cond if key in out else torch.full(context.shape[:2], neutral, device=context.device, dtype=context.dtype)
    if start is not None:
        apply(array[:, start:start + length])
    out[key] = comfy.conds.CONDRegular(array)


def biased_attention(previous, bias):
    def override(func, q, k, v, *args, **kwargs):
        # Only cross-attention has the context length on its keys; self-attention is left alone.
        if k.shape[2] == bias.shape[-1]:
            kwargs["mask"] = bias[:, None, None, :].to(q)
        if previous is not None:
            return previous(func, q, k, v, *args, **kwargs)
        return func(q, k, v, *args, **kwargs)
    return override


def norm_preserving_attention(previous, scale):
    def override(func, q, k, v, *args, **kwargs):
        def attention(v):
            if previous is not None:
                return previous(func, q, k, v, *args, **kwargs)
            return func(q, k, v, *args, **kwargs)
        out = attention(v)
        if k.shape[2] != scale.shape[-1]:
            return out
        # Keys are RMS-normed, so the weight only scaled the values: v / scale is the tag as written.
        reference = attention(v / scale[:, None, :, None].to(v))
        return out * (reference.norm(dim=-1, keepdim=True) / out.norm(dim=-1, keepdim=True).clamp(min=1e-6))
    return override


def cross_attention_wrapper(executor, *args, **kwargs):
    bias, scale = kwargs.pop(BIAS_KEY, None), kwargs.pop(SCALE_KEY, None)
    if bias is not None or scale is not None:
        options = kwargs.get("transformer_options", {}).copy()
        if bias is not None:
            options["optimized_attention_override"] = biased_attention(options.get("optimized_attention_override"), bias)
        if scale is not None:
            options["optimized_attention_override"] = norm_preserving_attention(options.get("optimized_attention_override"), scale)
        kwargs["transformer_options"] = options
    return executor(*args, **kwargs)


def encode_tag(clip, tag):
    cond, extra = clip.encode_from_tokens_scheduled(clip.tokenize(tag), show_pbar=False)[0]
    # Drop T5 </s>, the prompt already has its own.
    return cond, extra["t5xxl_ids"][:-1], extra["t5xxl_weights"][:-1]


def apply_tags(model, clip, weighted, mode):
    patched = model.clone()
    for tag, strength in weighted:
        cond, ids, weights = encode_tag(clip, tag)
        marks = []
        if mode == "attention":
            # log(w) on the logits multiplies the tag's attention by w before softmax renormalizes.
            patched.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, BIAS_KEY, cross_attention_wrapper)
            bias = math.log(strength)
            marks.append((BIAS_KEY, 0.0, lambda a, b=bias: a.add_(b)))
        else:
            weights = weights * strength
            if mode == "weight_norm":
                patched.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, BIAS_KEY, cross_attention_wrapper)
                marks.append((SCALE_KEY, 1.0, lambda a, s=strength: a.mul_(s)))
        patched.add_object_patch("extra_conds", extra_conds_with_tag(patched.get_model_object("extra_conds"), cond, ids, weights, marks))
    return patched


class LumenAnimaTagSlider(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenAnimaTagSlider",
            display_name="Lumen Anima Tag Slider",
            category="Lumen",
            description="Adds a tag to the positive prompt with its own strength (Lumen's a::2 weights).",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip"),
                io.String.Input("tag", default=""),
                io.Combo.Input("mode", options=["attention", "weight_norm", "weight"], tooltip="attention biases how much the image attends to the tag, weight scales its contribution, weight_norm does the same but keeps each cross-attention output at the magnitude of the tag as written."),
                io.Float.Input("strength", default=1.0, min=0.0, max=1.5, step=0.05),
            ],
            outputs=[io.Model.Output()],
        )

    @classmethod
    def execute(cls, model, clip, tag, mode, strength):
        if strength == 0 or not tag.strip():
            return io.NodeOutput(model)
        return io.NodeOutput(apply_tags(model, clip, [(tag.strip(), strength)], mode))


class LumenAnimaStyleCode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenAnimaStyleCode",
            display_name="Lumen Anima Style Code",
            category="Lumen",
            description="--sref style codes: each code picks a few styles and artist tags with random weights and adds them to the positive prompt.",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip"),
                io.String.Input("codes", default="", tooltip="Style codes with an optional ::weight, like 123 456::0.5."),
                io.Int.Input("styles_per_code", default=2, min=0, max=8),
                io.Int.Input("artists_per_code", default=2, min=0, max=8),
                io.Float.Input("strength", default=1.5, min=0.0, max=4.0, step=0.05, tooltip="How much the image attends to the styles, like --sw; 1 is as written."),
            ],
            outputs=[io.Model.Output(), io.String.Output(display_name="styles", tooltip="The styles and artists the codes picked, with their weights.")],
        )

    @classmethod
    def execute(cls, model, clip, codes, styles_per_code, artists_per_code, strength):
        styles = mix_styles(parse_codes(codes), STYLES, styles_per_code, ARTISTS, artists_per_code)
        if strength == 0 or not styles:
            return io.NodeOutput(model, listing(styles))
        return io.NodeOutput(apply_tags(model, clip, [(style["text"], w * strength) for style, w in styles], "attention"), listing(styles))


NODES = [LumenAnimaTagSlider, LumenAnimaStyleCode]
