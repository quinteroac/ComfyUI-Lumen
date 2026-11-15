# ComfyUI Settings

The **ComfyUI** page sets which models and sizes Lumen uses, and lets you replace any action with your own workflow. Changes are saved in `user/<user>/lumen/config.json`.

The top of the page shows the connection: the ComfyUI version and the device it runs on. Model fields suggest the files your ComfyUI has.

## Sections

| Section | Sets |
| --- | --- |
| Models | The default models: which are installed, and downloads on request. See [Installation & Requirements](#installation). |
| MiniMax H3 Image | Model, text encoder, VAE, the prompt enhancer's model, the six sigmas, LCM noise, and the draft, SD and HD megapixels. |
| Anima and MOSS Image | Each model with its LoRA, encoder, VAE, steps, CFG, sampler, scheduler, sizes and negative prompt; SnapRef and its mode for `--cref` on Anima. |
| Styles (--sref) | Styles per code (H3, MOSS), styles and artists per code on Anima, and the preview prompt of Explore › Styles. |
| Video (MiniMax H3) | fl2va and ref2va models and LoRAs, video and audio VAEs, SD and HD megapixels, frames, sigmas, and the RelayVSR model and VAE. |
| Conversational mode (GGUF) | The model from `models/LLM`, GPU layers, context, answer length and temperature. |
| Prompt weights (a::2) | attention or weight_norm. See [Multi-Prompts](#multi-prompts). |
| Sizes | Upscale megapixels. |
| Your workflows | A custom workflow for each action. See [Custom Workflows](#custom-workflows). |

> **Tip:** When a model file is missing, Lumen names it and the loader before sending the job, so you can fix it here.
