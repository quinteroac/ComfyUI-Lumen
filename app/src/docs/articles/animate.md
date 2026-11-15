# Animate

Animate turns an image into a video that starts on it. Add an end frame to choose where it ends, or loop it.

![The start frame](cref-ref.webp)
![the shrine maiden, high motion](animate.mp4)

## How to use it

From a result:

| Button | Does |
| --- | --- |
| Auto · low / high | Animates with low or high motion and the image's prompt. |
| Loop · low / high | The same, ending on the first frame so the video loops. |
| Manual… | Puts the image in the bar as the start frame; describe the motion and press Enter. |

Hover shortcut **Animate** uses low motion.

From the imagine bar: drop a picture on **Start frame** and write what happens. Add a picture on **End frame** to finish the video on it, or add `--loop` to end on the start frame.

```prompt
she spins and lands a high kick, her sleeves swirling --motion high
the camera slowly circles around her --loop
```

## Tips

- The video keeps the image's aspect ratio, at the video [resolution](#resolution).
- With an end frame, describe how the scene gets from one picture to the other.
- Start and end frames also work together with [reference pictures](#video-references).
