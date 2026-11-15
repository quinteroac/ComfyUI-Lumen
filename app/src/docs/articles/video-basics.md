# Creating Video

Lumen makes short videos with sound with MiniMax H3 Video. Write what happens, add `--video` (or turn on video mode with the camera button), and press Enter.

![a red fox trotting through a snowy forest at dawn, its breath steaming --ar 16:9 --video](t2v.mp4)

```prompt
a red fox trotting through a snowy forest at dawn, its breath steaming --ar 16:9 --video
```

## What you get

- About 5 seconds (124 frames at 24 fps), always with audio: sounds of the scene and, often, music.
- SD is 0.5 megapixels, HD (`--hd`) 1 megapixel. Use `--ar` for the shape.
- `--bs 1`, `2` or `4` sets how many videos a prompt makes (also in the bar's settings).
- A video takes about 3 minutes at SD on a 16 GB GPU.

## Motion

`--motion low` (default) asks for subtle motion and a slow camera; `--motion high` for dynamic motion and a fast camera. In [Animate](#animate) you can also write your own description of the motion.

## Writing video prompts

Describe the action in order, the camera and the sound. You do not need a long prompt: once per job, Lumen's video enhancer rewrites your request with MiniMax's official video prompt guide, with the scene, camera, sounds and music, and every video of the job uses that text.

## Models

Text to video, Animate, end frames and loops use H3's fl2va model with the Pika Flex LoRA; videos with [reference pictures](#video-references) use the ref2va model with its own. See [ComfyUI Settings](#comfyui-settings).

Next: [Animate an image](#animate), [extend a video](#extend-video) or [upscale it](#upscale-video).
