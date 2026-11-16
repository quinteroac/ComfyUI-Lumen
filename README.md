# ComfyUI-Lumen

An image and video studio for ComfyUI: a prompt bar with Midjourney-style parameters, a grid of results and one-click actions.

Lumen is a ComfyUI plugin (a custom node pack), not a separate app. ComfyUI serves its page at `/lumen/` and runs every job on its own queue, with the nodes Lumen brings and the models in ComfyUI's `models/` folder.

## Installation

Requires a recent ComfyUI, with the MiniMax H3 Image and Video, RelayVSR and TextGenerateV2 nodes. Video needs a GPU with 16 GB of VRAM or more; images run with less.

1. Clone the pack into ComfyUI's `custom_nodes` folder:

   ```bash
   cd ComfyUI/custom_nodes
   git clone https://github.com/quinteroac/ComfyUI-Lumen
   ```

   Or, in ComfyUI-Manager, use **Install via Git URL** with the same address.
2. Restart ComfyUI.
3. Open **Lumen** from ComfyUI's menu or sidebar, or go to `http://<comfyui>/lumen/`.
4. On Lumen's **ComfyUI** page, under **Models**, download the models you're missing.

The page comes built in `dist/`, so Node.js isn't needed and there are no Python requirements to install. Optional: `triton` for the fast attention of Upscale ×4 (Linux installs of PyTorch usually have it), `llama-cpp-python` in ComfyUI's Python for the conversational mode, and Node.js 22+ for the MCP server.

To update, run `git pull` in `custom_nodes/ComfyUI-Lumen` and restart ComfyUI.

The documentation (English) is under **Help** in the sidebar, or at `/lumen/docs`. Its articles are Markdown files in `app/src/docs/articles/`, with images and videos in `app/public/docs-media/`.

## Models

| | |
|---|---|
| MiniMax H3 Image | every action: Imagine, image prompts, style references, Vary, Remix, Upscale, Zoom out, Pan, Editor |
| Anima (`--anima`), MOSS Image (`--moss`) | Imagine without reference images |
| MiniMax H3 Video (fl2va / ref2va + Pika Flex) | text → video, Animate, end frame, loop, up to 9 reference images, always with audio |
| RelayVSR ×2, ReCaVSR ×4 | Upscale video |

Model files, sizes and sampler settings are set on the **ComfyUI** page of the app. The **Models** card of that page downloads the default models on request (`downloads.py`: a fixed list of files from Hugging Face and Civitai, each checked against its SHA-256); the docs list them under **Installation & Requirements**.

The built-in workflows use core ComfyUI nodes and the nodes in `nodes/` (style codes, prompt weights, SnapRef for Anima and video extension), so no other node pack is needed. They come from other projects; see `THIRD_PARTY_NOTICES.md`.

- Grid: 1–4 images per creation, made one run after another (bar settings).
- `--hd` generates at more megapixels (4 MP on H3 Image); Upscale redraws at 16 MP (subtle from sigma 0.53, creative from 0.75).
- Zoom out, Pan and the Editor flatten the canvas on white and ask H3 Image to fill the white areas.
- Each action can use your own workflow (ComfyUI *Export (API)* JSON with `{{placeholders}}`).

- Extend continues a Lumen video from its saved AV latent and stitches the new clip on.
- Describe uses the prompt enhancer's model; the conversational mode runs a local GGUF (llama-cpp-python) that is loaded per message and unloaded after.

The page is in Spanish, English, Japanese and Chinese: the browser's language is used until one is picked in the sidebar.

Settings, jobs and styles are saved in ComfyUI's user folder (`user/<user>/lumen/`).

## MCP server

`mcp/server.mjs` is a stdio MCP server (Node.js 22+, no dependencies) that only talks to the ComfyUI server in `LUMEN_URL` (default `http://127.0.0.1:8188`).

```bash
claude mcp add lumen -e LUMEN_URL=http://127.0.0.1:8188 -- node /path/to/ComfyUI/custom_nodes/ComfyUI-Lumen/mcp/server.mjs
```

| Tool | Effect |
| --- | --- |
| `list_jobs`, `get_job` | Jobs with status, prompt, enhancer caption, styles and images |
| `view_image` | JPEG preview of a job image; a video as four frames in a 2×2 grid |
| `imagine` | A prompt with Lumen's parameters and optional references (Lumen images or local files), like the imagine bar |
| `act` | Vary, Upscale, Remix, Zoom out, Pan, Retexture, Animate, Extend, Upscale video or Describe on a job image |
| `cancel_job` | Cancels a queued or running job |

Reading works with Lumen closed. `imagine`, `act` and `cancel_job` are run by the open Lumen page, so they use the same enhancer, references and settings as its buttons and the jobs appear in Create.

## Building the page

The built page is in `dist/`. After changing `app/src`:

```bash
cd app && npm install && npm run build
```

## License

MIT, see `LICENSE`. Parts taken from other projects keep their own licenses, listed in `THIRD_PARTY_NOTICES.md`.
