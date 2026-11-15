# Multi-Prompts & Weights

Split a prompt into parts with `::` and give each part a weight to push a concept harder or softer.

```prompt
a red fox sitting in a snowy forest at sunrise:: watercolor painting::2 neon::0.5
```

![No weights](weights-plain.webp)
![watercolor painting::2 neon::0.5 (attention)](weights-attention.webp)
![The same with weight_norm](weights-wn.webp)

## How weights work

- A part without a number, or with `::1`, stays in the prompt as normal text.
- A part with any other weight leaves the prompt and is applied with the model's concept slider (LumenH3ConceptSlider, LumenMOSSConceptSlider or LumenAnimaTagSlider), chained after any [style code](#style-codes).
- The weight is the slider strength. Weights of 0 or less are ignored. There is no upper limit: very high weights can break the image.

## Mode

On the [ComfyUI page](#comfyui-settings), **Prompt weights** chooses how the sliders act:

| Mode | Effect |
| --- | --- |
| attention (default) | How much the image attends to the concept. |
| weight_norm | Scales the concept while keeping its magnitude. |

> **Note:** Negative prompts (`--no`) are not supported; describe what you want instead.
