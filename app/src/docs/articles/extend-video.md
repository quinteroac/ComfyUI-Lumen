# Extend Video

Extend continues a video from where it ends and joins the new part to it, so the video grows about 3.5 seconds each time, up to 4 times.

![A 5-second video extended once to 8.7 seconds](extend.mp4)

## How to use it

Open a video and choose:

| Button | Does |
| --- | --- |
| Auto · low / high | Continues with the video's prompt and low or high motion. |
| Manual… | Puts the prompt in the bar so you can change what happens next. |

The hover shortcut **Extend** continues with the video's own motion. The lightbox shows how many times a video has been extended.

## How it works

Every video Lumen makes saves its latent next to it. Extend loads it and keeps the last 39 frames (about 1.6 seconds) as the fixed start of a new clip, with their sound, so the motion and audio carry on without a cut. The video enhancer writes how the scene continues from that point. The new clip is then joined to the end of the original video with a short crossfade and brightness matching.

## Limits

- Only videos made by Lumen (text to video, Animate or Extend) can be extended; upscaled videos and uploaded files cannot.
- Extending needs the ComfyUI-MiniMaxH3-PrefixStream node pack.
- Each extension takes about as long as a new video.
