# Editor

The Editor changes part of an image: erase areas to regenerate them, move or scale the image on a bigger canvas, and describe the result you want.

![Erased area](edit-erase-src.webp)
![a small brown dog sitting on the pavement](edit-erase.webp)

## Opening an image

Open **Edit** in the sidebar and drag an image in, upload one or pick one of yours. From any result, use **Open editor** in the lightbox or **Open in the editor** in the right-click menu.

## Tools

| Tool | What it does |
| --- | --- |
| Move / scale | Drag and scale the image on the canvas. |
| Erase | Paint over areas to regenerate them. The brush size is set next to it. |
| Restore | Paints the erased areas back. |
| Aspect ratio | Changes the canvas shape; new empty space is generated. |
| Undo, Redo, Reset | Step back and forward, or start over. |

Checkered areas, erased or empty, are generated again; everything else is kept.

![Empty space at the bottom](edit-extend-src.webp)
![The scene continued downward](edit-extend.webp)

## The prompt

Describe the whole image you want to see, not only the change: "a yellow taxi and a small brown dog on a stone plaza, a blue umbrella and a red balloon in the sky". Press **Submit edit**; it runs as one job in Create.

## How it works

Erased and empty areas are filled with white, and MiniMax's [prompt enhancer](#prompt-basics) writes what must appear there from your prompt. H3 Image then redraws the white areas to fit the rest.

**Download edit** saves the canvas as you prepared it. See also [Retexture](#retexture) for changing the look of the whole image.
