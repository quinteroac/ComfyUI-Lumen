# Image Prompts

Use pictures as part of the prompt: Lumen takes their subject, composition and colors into the new image.

Drag up to four pictures onto **Image prompt** in the imagine bar, or choose **Use › Image** on any result, then write the prompt and press Enter. Image prompts always run on H3 Image, through the [prompt enhancer](#prompt-basics), which looks at each picture and writes how to use it.

![Image prompt](iw-src.webp)
![a snowy village at night --iw 0.3](iw-low.webp)
![a snowy village at night --iw 2](iw-high.webp)

## Image weight (--iw)

`--iw` sets how closely the result follows the image prompt, from 0 to 3 (default 1).

| Value | Effect |
| --- | --- |
| Below 0.5 | Loose inspiration: mood, colors and subject matter. |
| 1 | The picture is the reference for the subject, composition and colors. |
| Above 1.5 | Very close to the picture. |

```prompt
a snowy village at night --iw 0.3
```

> **Note:** H3 Image tends to keep the objects of an image prompt even at low weights; `--iw` mostly changes how much the composition and colors are kept.

For the look only, use a [style reference](#style-reference); for a person, a [character reference](#character-reference).
