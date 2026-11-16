# Prompt Basics

A prompt is the text that describes what you want. Lumen's main model, MiniMax H3 Image, understands full sentences, so describe the image the way you would describe it to a person.

## What makes a good prompt

- Say what kind of image it is first: a photograph, an anime illustration, an oil painting, a 3D render.
- Then the subject and how it looks, what it is doing, and where.
- Then the framing, the light, the colors and the mood.
- Leave out quality words like "masterpiece" or "8k"; they add nothing.

```prompt
a close-up portrait photograph of an old fisherman mending a net on a wooden pier at sunset, warm side light, shallow depth of field
an anime illustration of a girl reading under a cherry tree, soft pastel colors, petals in the wind
```

## Parameters

Anything after ` --` is a [parameter](#parameter-list), not part of the description. Parameters always go at the end, separated by spaces and without commas.

```prompt
a cozy wooden cabin in a snowy forest at dusk --ar 3:2 --draft
```

## The prompt enhancer

When a job has pictures (image prompts, style or character references, moodboards) or edits an image (Zoom Out, Pan, the Editor, Retexture), Lumen first asks MiniMax's official prompt enhancer to rewrite your prompt for H3 Image. It looks at the pictures and writes a detailed description that says what each one is for. It runs once per job, so all the images of a job share the same description and differ only by seed. Videos always go through the video enhancer.

New H3 Image pictures from text alone skip it by default. Turn on **Enhance prompt** in the imagine bar's settings to send them through MiniMax's text-to-image enhancer too: it turns a short prompt into a detailed description for the --ar you chose. With [`--sref`](#style-codes), the styles the code picked are given to it after your prompt, so the description is written in them. It adds a few seconds per job and does not apply to Anima or MOSS Image.

## Choosing the model

H3 Image makes everything by default. Add `--anima` or `--moss` to imagine with Anima or MOSS Image. See [Models](#models).

## Weights and variations

- Give parts of the prompt more or less weight with [multi-prompts](#multi-prompts): `watercolor::2`.
- Try several versions at once with [permutations](#permutations): `a {red, blue} bird`.
