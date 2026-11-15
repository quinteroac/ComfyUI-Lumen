# ComfyUI-Lumen

An image studio page for ComfyUI: a prompt bar with Midjourney-style parameters, a grid of results and one-click actions, all run on this ComfyUI server.

Open it from the **Lumen** menu in ComfyUI, or at `http://<comfyui>/lumen/`.

## Models

| | |
|---|---|
| MiniMax H3 Image | every action: Imagine, image prompts, style references, Vary, Remix, Upscale, Zoom out, Pan, Editor |
| Anima (`--anima`), MOSS Image (`--moss`) | Imagine without reference images |

Model files, sizes and sampler settings are set on the **ComfyUI** page of the app. The built-in workflows use core ComfyUI nodes only.

- Grid: 1–4 images per creation, made one run after another (bar settings).
- `--hd` generates at more megapixels (4 MP on H3 Image); Upscale redraws at 16 MP (subtle from sigma 0.53, creative from 0.75).
- Zoom out, Pan and the Editor flatten the canvas on white and ask H3 Image to fill the white areas.
- Each action can use your own workflow (ComfyUI *Export (API)* JSON with `{{placeholders}}`).

Video, Describe and the conversational mode need a custom workflow for now.

Settings, jobs and styles are saved in ComfyUI's user folder (`user/<user>/lumen/`).

## Building the page

The built page is in `dist/`. After changing `app/src`:

```bash
cd app && npm install && npm run build
```
