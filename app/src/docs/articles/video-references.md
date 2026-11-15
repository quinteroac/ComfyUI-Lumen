# Video References

Give a video up to 9 reference pictures (characters, objects, places or a style) and describe the scene. Lumen keeps what the pictures show while the video moves.

![Character reference](cref-ref.webp)
![she walks through a night festival holding a paper lantern](r2v.mp4)

## How to use it

1. Turn on video mode, or add `--video` to the prompt.
2. Drop pictures on **Image prompt** (subjects, objects or places), **Character (--cref)** or **Style reference**.
3. Describe the scene and press Enter.

```prompt
she walks through a night festival holding a paper lantern, stalls and fireworks behind her --video
```

## How it works

Videos with references use H3's ref2va model with its Pika Flex LoRA. The video enhancer looks at every picture and writes what each one is (the main character, a place, the style) before describing the scene. [`--cw`](#character-reference) sets what a character keeps.

You can add a start or end frame too; they are pinned as the first or last frame.

> **Note:** Style references change videos less than images. For a strong look, describe the style in the prompt as well.
