# Parameter List

Parameters change how a prompt is made. They go at the end of the prompt, each starting with `--`, separated by spaces and without commas.

```prompt
a lighthouse under the aurora --ar 16:9 --c 20 --seed 42
```

## Images

| Parameter | Values | What it does |
| --- | --- | --- |
| [--ar](#aspect-ratio) | `W:H`, e.g. `16:9` | Aspect ratio of the result. |
| [--draft](#draft-mode) | | Small, fast images. |
| [--hd / --sd](#resolution) | | Generate at more megapixels, or the normal size. |
| [--c](#variety) | 0–100 | How far Vary moves from the image. |
| [--w](#weird) | 0 or more (default 0) | Makes new images less conventional. |
| [--seed](#seeds) | 0–4294967295 | Repeats the same starting point. |
| [--r](#repeat) | 1–40 | Runs the prompt several times. |
| [--ck](#checkpoint) | diffusion model file | Generates with another diffusion model. |
| [--lora](#lora) | file name, `name::weight` | Adds one of your LoRAs. |
| [--anima / --moss](#models) | | Imagine with Anima or MOSS Image instead of H3 Image. |
| [--tile](#tile) | | Marks the job as a repeating pattern (custom workflows). |

## Styles and references

| Parameter | Values | What it does |
| --- | --- | --- |
| [--sref](#style-codes) | code, `code::weight`, `random` | Mixes the styles of a style code. |
| [--sw](#style-codes) | 0 or more (default 100) | Strength of `--sref`. |
| [--iw](#image-prompts) | 0–3 (default 1) | How closely the image prompt is followed. |
| [--cw](#character-reference) | 0–100 (default 100) | What a character reference keeps. |
| [--p](#personalization) | nothing, or profile and moodboard codes | Applies your personalization. |

## Video

| Parameter | Values | What it does |
| --- | --- | --- |
| [--video](#video-basics) | | Makes a video instead of images. |
| [--motion](#video-basics) | `low` or `high` | Amount of motion. |
| [--loop](#animate) | | The video ends on its first frame. |
| [--bs](#video-basics) | 1, 2 or 4 | Videos per prompt. |

## Prompt syntax

| Syntax | What it does |
| --- | --- |
| `a::2 b::0.5` | [Multi-prompt weights](#multi-prompts). |
| `{a, b}` | [Permutations](#permutations): one job per option. |

> **Note:** `--v`, `--niji`, `--stealth` and `--public` are accepted and shown with the job, but change nothing in Lumen.
