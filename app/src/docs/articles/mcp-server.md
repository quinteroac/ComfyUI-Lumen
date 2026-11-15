# MCP Server

Lumen includes an MCP server, so an AI agent such as Claude Code can create images and videos with Lumen, read your jobs and look at the results.

## Setting it up

The server is `mcp/server.mjs` in the ComfyUI-Lumen folder. It needs Node.js 22 or newer and only talks to your ComfyUI.

```
claude mcp add lumen -e LUMEN_URL=http://127.0.0.1:8188 -- node /path/to/ComfyUI/custom_nodes/ComfyUI-Lumen/mcp/server.mjs
```

Other MCP clients use the same command and the `LUMEN_URL` variable.

## Tools

| Tool | What it does |
| --- | --- |
| `list_jobs`, `get_job` | Jobs with their status, prompt, the enhancer's description, styles and images. |
| `view_image` | A JPEG preview of an image; a video comes as four frames in a 2×2 grid. |
| `imagine` | A prompt with Lumen's parameters and optional references (your Lumen images or local files), like the imagine bar. |
| `act` | Vary, Upscale, Remix, Zoom Out, Pan, Retexture, Animate, Extend, Upscale video or Describe on an image. |
| `cancel_job` | Cancels a queued or running job. |

## How it works

Reading jobs and images works with Lumen closed. Creating needs Lumen open in a browser: the agent's request is run by the page exactly as a click would, with the same enhancer, references and settings, and the job appears live in Create. By default an action waits until its jobs finish; videos take a few minutes each.
