# Upscale Video

Upscale ×2 doubles the size of a video with RelayVSR; Upscale ×4 makes it four times as large with ReCaVSR. Both keep its sound and frame rate.

![A detail at the same scale: the original enlarged (left) and RelayVSR ×2 (right)](vsr-compare.webp)

Open a video and choose **Video › Upscale ×2** or **Upscale ×4**. With ×2, a 960×544 video becomes 1920×1088 in about 20 seconds; with ×4 it becomes 3840×2176. On a 16 GB card, ×4 of a 488×830 clip (to 1952×3320) ran at about 1.25 frames per second.

## How it works

RelayVSR runs one sampling step on the video at its own size and its decoder rebuilds every frame at twice the resolution, adding detail to edges and textures. The audio of the original is kept.

- An upscaled video cannot be [extended](#extend-video); extend first, then upscale.
- With ×2 every output frame is held in memory: long or HD videos need a lot of RAM.

## Upscale ×4

ReCaVSR is a video super-resolution model built on Wan2.2 TI2V-5B and trained for 4×. It upscales the video 21 frames and then 8 at a time, one sampling step per block, reusing the previous block's result and what each layer remembers of earlier frames, so detail stays steady from frame to frame. Its own decoder turns each block into frames, and Lumen writes them into the video as it goes: a long video takes disk space, not memory.

- It needs the three ReCaVSR files (about 6.5 GB); download them on the [ComfyUI page](#comfyui-settings) under **Models**. The transformer is ReCaVSR's in INT8-ConvRot, 1.7 times as fast as the original BF16 one, which also works: pick it on the ComfyUI page.
- The size of the result sets the memory it needs. A ×4 of an HD video may not fit on your card; ComfyUI then reports the error.
- After a cut to another shot, the first frames of the new shot can still shimmer with the previous one.

The RelayVSR model and VAE, and the three ReCaVSR files, are set on the [ComfyUI page](#comfyui-settings).
