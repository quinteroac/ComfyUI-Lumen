# Style Codes

A style code is a number that always gives the same look. Add `--sref` and a code to a prompt, and Lumen mixes the styles that code stands for into the image.

```prompt
a cozy wooden cabin in a snowy forest at dusk, warm light in the windows --ar 3:2 --sref 2026
```

![No style code](cabin.webp)
![--sref 2026](sref-a.webp)
![--sref 3141](sref-b.webp)
![--sref 1001](sref-c.webp)

## How it works

Each code picks a few styles from the style list of the model's Style Code node (MiniMaxH3StyleCode, MOSSStyleCode or AnimaStyleCode), always the same ones for the same code, and mixes them with weights. The styles a code picked are listed under the job's prompt.

- On H3 Image and MOSS Image a code mixes 4 styles; on Anima, 2 styles and 2 artists. Both can be changed on the [ComfyUI page](#comfyui-settings).
- The same code gives a related but different look on each model.

![--sref 7 on H3 Image](sref7-h3.webp)
![on MOSS Image](sref7-moss.webp)
![on Anima](sref7-anima.webp)

## Mixing codes

Write several codes to mix them, with an optional weight after `::`.

```prompt
a cozy wooden cabin in a snowy forest at dusk --sref 2026 1001::0.5
```

`--sref random` picks a new code; the code it picked is written into the job, so Repeat and Use keep the same look.

## Style weight (--sw)

`--sw` sets how strongly the styles apply. 100 is normal, 0 turns the styles off, and higher values push them harder.

```prompt
a cozy wooden cabin in a snowy forest at dusk --sref 2026 --sw 200
```

## Where to find codes

- [Explore › Styles](#style-explorer) shows codes with a real preview.
- The [Style Creator](#style-creator) helps you build a mix from codes you pick.
- [Personalization](#personalization) learns a mix from your choices.

> **Note:** Style codes apply only when creating images (Imagine and image prompts), not to edits, which keep the look of the image you edit. Some codes bring content with their styles, such as people or objects; try another code if a style takes over the subject.
