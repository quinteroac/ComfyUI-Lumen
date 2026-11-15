# Custom Workflows

Any action can run your own ComfyUI workflow instead of the built-in one: a different model, a LoRA, an upscaler, a video model.

## Adding a workflow

1. In ComfyUI, open your workflow and choose **Workflow › Export (API)**.
2. On Lumen's [ComfyUI page](#comfyui-settings), under **Your workflows**, paste the JSON into the action (or **Upload .json**).
3. Leave it empty to go back to the built-in workflow. **Download built-in workflow** gives you Lumen's own as a starting point.

The workflow must save its result with a node such as SaveImage, SaveAnimatedWEBP or SaveVideo. For Describe and the conversational mode, use a node that shows text, such as PreviewAny or ShowText.

## Placeholders

Write a placeholder as the value of any field, and Lumen fills it for each run. A field that is only a placeholder receives the value with its type (a number, a list); inside longer text it is written as text.

```
{{prompt}}  {{seed}}  {{width}}  {{height}}  {{image}}
```

| Placeholder | Value |
| --- | --- |
| `{{prompt}}` | The prompt text, without parameters. |
| `{{concepts}}` | Weighted segments (`a::2`), as a list of `{text, weight}`. |
| `{{seed}}`, `{{width}}`, `{{height}}` | Seed and size in pixels. |
| `{{batch}}` | Images per run (1: the grid is made in consecutive runs). |
| `{{engine}}` | The model asked for: `h3`, `anima` or `moss`. |
| `{{denoise}}` | Change strength for Vary, Remix and Upscale (0–1). |
| `{{image}}` | The input image of Vary, Upscale, Zoom Out, Pan, the Editor or Animate. |
| `{{image_2}}`, `{{images}}` | The second image prompt, or all of them. |
| `{{style_image}}`, `{{style_images}}` | The first style reference, or all of them. |
| `{{image_weight}}`, `{{style_weight}}` | `--iw` and `--sw`. |
| `{{sref}}`, `{{moodboard}}` | Style codes and `--p` codes. |
| `{{chaos}}`, `{{aspect}}`, `{{hd}}`, `{{tile}}` | Variety, aspect ratio, HD and tile. |
| `{{pad_left}}` and the other pads | Padding for Pan and Zoom Out. |
| `{{frames}}`, `{{fps}}`, `{{motion}}`, `{{motion_prompt}}`, `{{end_image}}`, `{{loop}}` | Video settings. |
| `{{message}}`, `{{current_prompt}}` | Conversational mode. |

## Without placeholders

If a workflow has none, Lumen fills the usual nodes: the seed of samplers and RandomNoise, the text of the prompt's text encoder (CLIPTextEncode and similar), the size of empty latents and the length of video latents, the frame rate of video savers, and the image of LoadImage nodes. With several LoadImage nodes, put **style** in the title of the style reference one and **end** in the title of the end frame one.
