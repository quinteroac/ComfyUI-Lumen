# Quick Start

Lumen is an image and video studio that runs on your own ComfyUI. Write an idea, press Enter, and Lumen builds the workflow, sends it to ComfyUI and shows the results as they finish.

![A lighthouse under the aurora, made with one prompt](hero.webp)

## Open Lumen

In ComfyUI, choose **Lumen › Open Lumen** in the menu, or the Lumen button in the sidebar. Lumen opens over ComfyUI; the ✕ button or Esc takes you back, and jobs keep running while it is hidden. You can also open it in its own tab at `http://<your-comfyui>/lumen/`.

## Make your first image

1. Click the bar at the top of **Create** and describe what you want to see.
2. Press **Enter**. A new job appears with a placeholder for each image.
3. Images appear one by one as ComfyUI finishes them.

```prompt
a lighthouse on a rocky cliff under a vivid green aurora borealis, long exposure night photograph --ar 16:9
```

Each job makes 1 to 4 images (set in the bar's settings), one ComfyUI run after another, with the seed counting up.

## Next steps

- Hover over an image for quick actions, or click it to open every action: [Vary](#vary), [Upscale](#upscale), [Remix](#remix), [Zoom Out](#zoom-out), [Pan](#pan), the [Editor](#editor) and [Animate](#animate).
- Add [parameters](#parameter-list) at the end of the prompt, like `--ar 16:9` or `--draft`.
- Give your images a look with a [style code](#style-codes), or keep a character with a [character reference](#character-reference).
- Make a [video](#video-basics) with sound by adding `--video`.

> **Tip:** The first image of a session takes longer while ComfyUI loads the models.
