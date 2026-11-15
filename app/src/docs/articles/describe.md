# Describe

Describe looks at an image and writes four prompts that could make a picture like it. Use it to learn how to describe a look, or to start from an image you like.

Open an image and choose **Use › Describe**, right-click it and choose **Describe image**, or drop an image on the imagine bar and use **Describe**.

![The image](describe-src.webp)

Describe wrote these four prompts for it:

```prompt
A photograph of a red fox sitting upright in tall, dry grass during golden hour. Its fur is a rich copper-orange with a white chest and muzzle, ears perked forward as it gazes directly at the camera. The background is a soft-focus field of amber and brown stalks. --ar 1:1
An intimate wildlife portrait capturing a moment of quiet alertness. Soft, directional light wraps around the subject, highlighting the texture of its fur against a blurred sea of autumnal grasses; warm oranges, deep browns and creamy whites. --ar 1:1
A tightly framed close-up shot taken from eye level with the fox. A very shallow depth of field renders the surrounding grass into abstract streaks of gold and tan, and backlighting creates a glowing rim along its ears and back. --ar 1:1
A clear photo of a red fox in a grassy field. It has orange and white fur and looks forward. Sunlight shines on its face. Tall grass surrounds it. --ar 1:1
```

## What you get

- Four different prompts: a close description, one about style and mood, one about composition, and a short one.
- Each keeps the aspect ratio of the image as `--ar`.
- **Use prompt** puts one in the bar, **Imagine** runs it, and **Run all** runs the four.

Describe uses the prompt enhancer's model (Qwen 3.5 9B by default) and takes a few seconds.

> **Note:** Transparent areas of a PNG are read as black.
