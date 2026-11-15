# LoRA

`--lora` adds one of the LoRAs in your ComfyUI `models/loras` folder to the image model. It is a Lumen parameter; Midjourney has no equivalent.

```prompt
a fox in a snowy forest --anima --lora anima/ink_00004_1000_steps::0.8
```

- Write the file as ComfyUI lists it, with its subfolder. `.safetensors` can be left out.
- `::weight` sets the strength; the default is 1, and 0 leaves the LoRA out. There is no upper limit.
- Use `--lora` once for each LoRA: `--lora a::0.6 --lora b`.
- After `--lora`, the bar lists every LoRA in the folder; what you type jumps to the first file that matches. Use the arrow keys and Tab or Enter to pick one, Esc to close the list.

## Which jobs use it

The LoRA is loaded on the image model of every image job: Imagine, Image prompt, and the edits on H3 Image (Vary, Remix, Upscale, Zoom out, Pan, Editor, Retexture). Video jobs and Describe ignore it.

A LoRA only works on the model it was trained for. Edits always run on H3 Image, so an Anima or MOSS Image LoRA does nothing there.

To load a LoRA on every personalized job, set it on a [profile](#personalization) instead.

> **Note:** The list of files is read when Lumen opens. Reload the page after adding LoRAs to the folder.
