# How Lumen Works

Lumen is a page served by the ComfyUI-Lumen node pack. Every button builds a ComfyUI workflow, sends it to the ComfyUI that serves the page and follows its progress. Nothing leaves your machine.

## A job

1. Lumen reads the prompt and its [parameters](#parameter-list), and uploads the pictures the job needs to ComfyUI's input folder.
2. When the job has pictures, edits an image or makes a video, the [prompt enhancer](#prompt-basics) writes the description first, once per job.
3. Each image or video is one ComfyUI run, one after another, with the seed counting up. Results appear as they finish.

## Models

| Task | Model |
| --- | --- |
| Images and every edit | MiniMax H3 Image, with LCM and six fixed sigmas |
| `--anima`, `--moss` | Anima with its turbo LoRA, MOSS Image with its DMD LoRA |
| `--cref` on Anima | Lumen's SnapRef node with a SnapRef adapter |
| Prompt enhancer, Describe | Qwen 3.5 9B (through TextGenerateV2) |
| Videos | MiniMax H3 Video fl2va / ref2va with the Pika Flex LoRAs |
| Extend | Lumen's continuation nodes (from ComfyUI-MiniMaxH3-PrefixStream) |
| Upscale video | RelayVSR ×2 |
| Conversational mode | A GGUF model with llama-cpp-python |
| Style codes, weights | Lumen's Style Code and Concept Slider nodes (from the H3, MOSS and Anima slider packs) |

All of them can be changed on the [ComfyUI page](#comfyui-settings), and any action can use [your own workflow](#custom-workflows).

## Memory

Jobs run in ComfyUI's queue like any other workflow, so ComfyUI loads and unloads models as usual. The conversational mode unloads ComfyUI's models before each message and frees its own memory after answering.

## Where things are saved

| What | Where |
| --- | --- |
| Jobs, settings, styles, profiles, folders | `user/<user>/lumen/` |
| Images and videos | `output/lumen/` |
| Video latents (for Extend) | `output/lumen/latents/` |
| Uploaded pictures | `input/` |
