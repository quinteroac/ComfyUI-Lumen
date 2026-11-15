# Retexture

Retexture changes the look of an image while keeping its structure: the composition, the camera and the shape and place of every element stay; the materials, colors, light and style change.

![The original](iw-src.webp)
![made of glass and chrome under neon light](retex-glass.webp)

![The original](cref-ref.webp)
![a thick impasto oil painting](retex-oil.webp)

## How to use it

1. Open **Edit** and choose the **Retexture** tab, with the image you want.
2. Describe the new look: materials, colors, light or style.
3. Press **Submit edit**.

```prompt
made of glass and chrome under neon light
a thick impasto oil painting on canvas
```

## How it works

The whole image goes to MiniMax's [prompt enhancer](#prompt-basics) with the instruction to keep the composition and redraw the surfaces as you describe; H3 Image draws the result at the same size. Retexture uses the whole image, without erasing or moving.
