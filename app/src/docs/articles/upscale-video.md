# Upscale Video

Upscale ×2 doubles the size of a video with RelayVSR, keeping its sound and frame rate.

![A detail at the same scale: the original enlarged (left) and RelayVSR ×2 (right)](vsr-compare.webp)

Open a video and choose **Video › Upscale ×2**. A 960×544 video becomes 1920×1088 in about 20 seconds.

## How it works

RelayVSR runs one sampling step on the video at its own size and its decoder rebuilds every frame at twice the resolution, adding detail to edges and textures. The audio of the original is kept.

- An upscaled video cannot be [extended](#extend-video); extend first, then upscale.
- Every output frame is held in memory: long or HD videos need a lot of RAM.

The RelayVSR model and its VAE are set on the [ComfyUI page](#comfyui-settings).
