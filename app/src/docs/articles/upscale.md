# Upscale

Upscale redraws an image at 16 megapixels, adding real detail rather than stretching pixels.

Open an image and choose **Upscale › Subtle** or **Creative**. Each makes one image with the same prompt.

| Option | Effect |
| --- | --- |
| Subtle | Keeps the image as it is and adds fine detail. |
| Creative | Redraws more freely: new texture and small details can change. |

## How it works

The image is enlarged to 16 megapixels and H3 Image redraws it from a point partway through its sampling (later for Subtle, earlier for Creative). There is no separate upscaling model, so the result follows the prompt and the model's own detail.

A 16 megapixel image takes several minutes. Change the size on the [ComfyUI page](#comfyui-settings) under **Sizes**.

> **Tip:** To make a new image at a large size from the start, use [`--hd`](#resolution). For videos, see [Upscale Video](#upscale-video).
