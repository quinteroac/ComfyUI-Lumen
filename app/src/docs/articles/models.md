# Models

Lumen uses three image models. MiniMax H3 Image makes everything by default; add a parameter to imagine with another one.

```prompt
a girl in a yellow raincoat holding a red umbrella on a rainy neon-lit street at night --ar 2:3 --anima
```

![H3 Image](engine-h3.webp)
![--anima](engine-anima.webp)
![--moss](engine-moss.webp)

| Model | Parameter | Good at |
| --- | --- | --- |
| MiniMax H3 Image | (default) | Every kind of image, long descriptions, text in images, editing. |
| Anima | `--anima` | Anime and illustration, with its turbo LoRA (8 steps). |
| MOSS Image | `--moss` | Photographic and illustrated images, with its DMD LoRA (8 steps). |

## What runs where

- `--anima` and `--moss` only work for Imagine without pictures. Anything that starts from an image (Vary, Remix, Upscale, Zoom Out, Pan, the Editor, Retexture) runs on H3 Image.
- Image prompts and style references need H3 Image; with them, Lumen uses H3 Image and tells you.
- A [character reference](#character-reference) works with Anima too, through SnapRef.
- [Style codes](#style-codes) and [weights](#multi-prompts) work with all three.

Videos use MiniMax H3 Video. See [Video](#video-basics).
