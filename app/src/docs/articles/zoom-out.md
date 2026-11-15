# Zoom Out

Zoom Out shows more of the scene around an image, as if the camera moved back. Lumen places the image smaller in the middle and fills the new space around it.

![The original](zoom-src.webp)
![Zoom Out 1.5×](zoom-15.webp)

![The original](zoom2-src.webp)
![Zoom Out 2×](zoom-2.webp)

## How to use it

Open an image and choose **Edit › Zoom out 1.5×** or **2×**. The result has the same size and aspect ratio as the original.

## How it works

The image is shrunk onto a larger white canvas. MiniMax's [prompt enhancer](#prompt-basics) looks at it and writes what newly becomes visible on every side (for a person, the rest of the body and the place around them), and H3 Image fills the white area to match.

> **Tip:** Zoom out several times in a row to reveal a wide scene from a close-up.
