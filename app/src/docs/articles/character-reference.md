# Character Reference

A character reference keeps the same person or character across images. Put a picture of them in **Character (--cref)** in the imagine bar and describe the new scene.

![Character reference](cref-ref.webp)
![eating ramen at a night stall (--cw 100)](cref-h3.webp)
![walking in an office, --cw 0](cref-cw0.webp)
![the same on Anima](cref-anima.webp)

```prompt
she eats ramen at a night food stall, paper lanterns, steam rising
she walks through a modern office holding a coffee, wearing a grey suit --cw 0
```

## Character weight (--cw)

`--cw` sets what the reference keeps, from 0 to 100 (default 100).

| Value | Keeps |
| --- | --- |
| 0–30 | The face only, so the prompt can change hair and clothes. |
| 31–70 | Face, hair and build. |
| 71–100 | Face, hair, body and outfit. |

## On each model

- **H3 Image** (default): up to three pictures go to the [prompt enhancer](#prompt-basics), which describes the character and what to keep.
- **Anima** (`--anima`): the pictures go to SnapRef, and `--cw` is its fidelity. The mode (character and style, or character only) is set on the [ComfyUI page](#comfyui-settings).
- **MOSS Image** has no character reference; with `--moss`, Lumen uses H3 Image.

Character references also work for [videos](#video-references).
