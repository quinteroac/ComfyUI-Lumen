# Checkpoint

`--ck` loads another diffusion model for the job instead of the model's own, for example a specific MOSS Image version. It is a Lumen parameter; Midjourney has no equivalent.

```prompt
a lighthouse in a storm --moss --ck moss/moss_image_sft_int8_convrot
```

- Write the file as ComfyUI lists it in `models/diffusion_models`, with its subfolder. `.safetensors` can be left out.
- After `--ck`, the bar lists every `.safetensors` file in that folder; what you type jumps to the first one that matches.
- The rest of the workflow stays the same: the text encoder, VAE, turbo LoRA, steps and sampler are the ones of the model you chose with `--anima` or `--moss` (H3 Image without either). Pick a file of that same family.
- It replaces the model of image jobs, edits included, and of H3 videos. Describe and Upscale video ignore it.

Lumen only checks that the file exists. If it doesn't fit the workflow, the job fails with ComfyUI's own error.
