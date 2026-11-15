# Resolution

Lumen generates directly at the size you ask for; there is no second upscaling pass. Each model has three sizes, in megapixels:

| Model | Draft | SD (default) | HD |
| --- | --- | --- | --- |
| H3 Image | 1 | 4 | 16 |
| MOSS Image (`--moss`) | 1 | 2 | 5 |
| Anima (`--anima`) | 1 | 1 | 1 |
| Video | | 0.5 | 1 |

- `--draft` or the lightning button: draft size. See [Draft Mode](#draft-mode).
- `--hd`: HD size, for images and videos. `--sd`: the normal size, even when the bar is set to HD.
- **Repeat in HD** runs a finished job again at HD (with a new seed, unless the prompt has `--seed`).

HD takes much longer: a 16 megapixel H3 image takes several times as long as a 4 megapixel one.

To enlarge an image you already made, use [Upscale](#upscale), which redraws it at 16 megapixels. The sizes can be changed on the [ComfyUI page](#comfyui-settings).
