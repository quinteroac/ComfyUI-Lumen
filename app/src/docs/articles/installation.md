# Installation & Requirements

Lumen is a ComfyUI node pack. It brings the extra nodes its workflows need, so besides a recent ComfyUI you only need the model files.

## Requirements

- A recent ComfyUI with the MiniMax H3 Image and Video, RelayVSR and TextGenerateV2 nodes.
- A GPU with 16 GB of VRAM or more for video; images run with less.
- Optional: `triton` for the fast attention of Upscale ×4 (without it, it runs much slower), `llama-cpp-python` in ComfyUI's Python for [conversational mode](#conversational-mode), and Node.js 22 or newer for the [MCP server](#mcp-server).

No other custom node packs are needed: the style codes, weights, Anima character references and video extension run on nodes included in Lumen. See [Acknowledgements](#acknowledgements).

## Installing

1. Put the `ComfyUI-Lumen` folder in `ComfyUI/custom_nodes/`.
2. Restart ComfyUI and open **Lumen** from its menu or sidebar.
3. On the [ComfyUI page](#comfyui-settings), under **Models**, download what is missing.

## Downloading the models

The **Models** card of the ComfyUI page lists the default models, shows which are installed, and downloads them when you press **Download** (or **Download the missing ones**). Each file comes from the address in the table below, is saved in its folder under the location chosen in **Save to** (ComfyUI's `models/` folder or a folder of `extra_model_paths.yaml`), and is kept only if its size and SHA-256 match. Downloads run one after another and can be cancelled. Lumen makes no other request to the internet.

## Models

These are the defaults. To install one by hand, put it in the folder shown, or pick other files on the [ComfyUI page](#comfyui-settings); a missing file is named, with its loader, before a job is sent.

| Used for | File | Folder in `models/` | Download |
| --- | --- | --- | --- |
| H3 Image | `minimax_h3_image_pruned_int8_convrot.safetensors` | `diffusion_models/minimax/` | [Comfy-Org/MiniMax-H3-Image](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/main/diffusion_models/minimax_h3_image_pruned_int8_convrot.safetensors) |
| H3 text encoder (images and video) | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `text_encoders/minimax/` | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors) |
| H3 Image VAE | `minimax_h3_image_vae_fp16.safetensors` | `vae/minimax/` | [Comfy-Org/MiniMax-H3-Image](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/main/vae/minimax_h3_image_vae_fp16.safetensors) |
| Prompt enhancer and Describe | `qwen3.5_9b_w4a8_gptq.safetensors` | `text_encoders/moss/` | [Comfy-Org/MOSS-Image](https://huggingface.co/Comfy-Org/MOSS-Image/resolve/main/text_encoders/qwen3.5_9b_w4a8_gptq.safetensors) |
| Video without references | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `diffusion_models/minimax/` | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors) |
| Video with references, Extend | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `diffusion_models/minimax/` | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors) |
| Pika Flex LoRAs | `pika_h3_flex_fl2va_comfy_bf16.safetensors`, `pika_h3_flex_ref2va_comfy_bf16.safetensors` | `loras/minimax/pika/` | [Pika-Labs/Pika-H3-Flex](https://huggingface.co/Pika-Labs/Pika-H3-Flex/tree/main/comfy/loras) (folder `comfy/loras`) |
| Video and audio VAEs | `minimax_h3_video_vae_int8_convrot.safetensors`, `minimax_h3_audio_vae_fp32.safetensors` | `vae/minimax/` | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/tree/main/vae) |
| Upscale video | `relayvsr_x2_lightx2v_int8_convrot.safetensors` | `diffusion_models/relayvsr/` | [Comfy-Org/RelayVSR](https://huggingface.co/Comfy-Org/RelayVSR/resolve/main/diffusion_models/relayvsr_x2_lightx2v_int8_convrot.safetensors) |
| Upscale video VAE | `relayvsr_flash_vae_x2_fp32.safetensors` | `vae/relayvsr/` | [Comfy-Org/RelayVSR](https://huggingface.co/Comfy-Org/RelayVSR/resolve/main/vae/relayvsr_flash_vae_x2_fp32.safetensors) |
| Upscale video ×4 | `recavsr_transformer_int8_convrot.safetensors` | `diffusion_models/recavsr/` | [paralaif/ReCaVSR-comfy-int8-convrot](https://huggingface.co/paralaif/ReCaVSR-comfy-int8-convrot/resolve/main/recavsr_transformer_int8_convrot.safetensors) (ReCaVSR's transformer in INT8-ConvRot) |
| Upscale video ×4 prompt | `recavsr_prompt.safetensors` | `diffusion_models/recavsr/` | [kopper/ReCaVSR](https://huggingface.co/kopper/ReCaVSR/resolve/main/prompt.safetensors) (`prompt.safetensors`, renamed) |
| Upscale video ×4 decoder | `recavsr_flashdecoder_fp32.safetensors` | `vae/recavsr/` | [kopper/ReCaVSR](https://huggingface.co/kopper/ReCaVSR/resolve/main/flashdecoder.safetensors) (`flashdecoder.safetensors`, renamed) |
| Anima (`--anima`) | `anima-base-v1.0.safetensors` | `diffusion_models/anima/` | [circlestone-labs/Anima](https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors) |
| Anima turbo LoRA | `anima-turbo-lora-v0.2.safetensors` | `loras/anima/` | [Anima Turbo LoRA v0.2 on Civitai](https://civitai.com/models/2560840/anima-turbo-lora) |
| Anima text encoder | `qwen_3_06b_base.safetensors` | `text_encoders/` | [circlestone-labs/Anima](https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors) |
| Anima VAE | `qwen_image_vae.safetensors` | `vae/` | [Comfy-Org/Qwen-Image_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors) |
| `--cref` on Anima | `snapref_v2a_pre2.safetensors` | `loras/` | [0ppxnhximxr/snapref-v2a-pre2](https://huggingface.co/0ppxnhximxr/snapref-v2a-pre2/resolve/main/snapref_v2a_pre2.safetensors) |
| MOSS Image (`--moss`) | `moss_image_sft_int8_convrot.safetensors` | `diffusion_models/moss/` | [Comfy-Org/MOSS-Image](https://huggingface.co/Comfy-Org/MOSS-Image/resolve/main/diffusion_models/moss_image_sft_int8_convrot.safetensors) |
| MOSS DMD LoRA | `moss_image_sft_8step_dmd.safetensors` | `loras/moss/` | [lodestones/MOSS-Image-SFT-8-steps-dmd](https://huggingface.co/lodestones/MOSS-Image-SFT-8-steps-dmd/resolve/main/lora.safetensors) (`lora.safetensors`, renamed) |
| MOSS text encoder | `qwen3.5_9b_int8_convrot.safetensors` | `text_encoders/moss/` | [Comfy-Org/MOSS-Image](https://huggingface.co/Comfy-Org/MOSS-Image/resolve/main/text_encoders/qwen3.5_9b_int8_convrot.safetensors) |
| MOSS VAE | `flux2-vae.safetensors` | `vae/` | [Comfy-Org/ERNIE-Image](https://huggingface.co/Comfy-Org/ERNIE-Image/resolve/main/vae/flux2-vae.safetensors) |
| Conversational mode | Any chat model in GGUF (default `gemma-4-12b-heretic-Q6_K.gguf`) | `LLM/` | Pick one on the ComfyUI page |

You only need the models of what you use: H3 Image alone runs every image action; video, Anima, MOSS Image and the conversational mode are independent.

> **Note:** Each model is under its own license, set by its authors; check its page before using what you make, especially for commercial use. LoRAs and adapters made from a model keep the license of that model: the MiniMax models, the Pika LoRAs and MiniMax's prompt guides are under the MiniMax community licenses; Anima, its turbo LoRA and SnapRef under the CircleStone Labs Non-Commercial License; and the MOSS DMD LoRA under MOSS Image's license.
