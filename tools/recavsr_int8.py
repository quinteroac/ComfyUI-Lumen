"""Converts ReCaVSR's bf16 transformer to ComfyUI's int8 ConvRot format (int8 weights with a scale per output row
after a 256-wide block Hadamard rotation, run by comfy-kitchen's int8 matmul).

Only the linear layers that run on every token of every block are quantized: self-attention q/k/v/out,
cross-attention q/out and the feed-forward. The cross-attention keys and values (computed once per video), the LQ
and recycled-latent projections, embeddings, norms and head stay bf16.

    python custom_nodes/ComfyUI-Lumen/tools/recavsr_int8.py models/diffusion_models/recavsr/recavsr_transformer_bf16.safetensors

Run it with ComfyUI's Python. It writes recavsr_transformer_int8_convrot.safetensors next to the input.
"""
import argparse
import json
import os
import re

import torch
from comfy_kitchen.tensor.int8 import TensorWiseINT8Layout
from safetensors.torch import load_file, save_file

QUANTIZED = re.compile(r"blocks\.\d+\.(attn1\.to_(q|k|v|out\.0)|attn2\.to_(q|out\.0)|ffn\.net\.(0\.proj|2))\.weight")
TAG = {"format": "int8_tensorwise", "convrot": True, "convrot_groupsize": 256}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("input")
    parser.add_argument("output", nargs="?")
    args = parser.parse_args()
    output = args.output or os.path.join(os.path.dirname(args.input), "recavsr_transformer_int8_convrot.safetensors")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tag = torch.tensor(list(json.dumps(TAG).encode("utf-8")), dtype=torch.uint8)
    state = load_file(args.input)
    converted = 0
    for key in [k for k in state if QUANTIZED.fullmatch(k)]:
        weight, params = TensorWiseINT8Layout.quantize(state[key].to(device), is_weight=True, per_channel=True, convrot=True, convrot_groupsize=TAG["convrot_groupsize"])
        prefix = key[:-len("weight")]
        state[key] = weight.cpu()
        state[prefix + "weight_scale"] = params.scale.float().cpu()
        state[prefix + "comfy_quant"] = tag.clone()
        converted += 1
    save_file(state, output)
    print(f"{converted} layers to int8 ConvRot: {output} ({os.path.getsize(output) / 2**30:.2f} GiB)")


if __name__ == "__main__":
    main()
