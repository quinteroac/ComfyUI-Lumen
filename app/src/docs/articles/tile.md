# Tile

`--tile` marks a job as a repeating pattern. Open a tile image in the lightbox and choose the pattern view to see it repeated.

```prompt
a seamless pattern of lemons and leaves on a pale blue background --tile
```

> **Note:** ComfyUI's core nodes have no tiling, so the built-in workflows do not make seamless images. Use your own workflow with a tiling node and the `{{tile}}` placeholder; see [Custom Workflows](#custom-workflows).
