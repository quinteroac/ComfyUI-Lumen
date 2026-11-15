# Moodboards

A moodboard is a collection of images that defines a style of your own. Use it in a prompt with `--p` and its code.

## Making a moodboard

1. Open **Moodboards** and create one.
2. Add images by uploading them, pasting an image URL, or choosing from your creations.
3. Optionally write **style words**, such as "earthy tones, soft light, paper texture".

## Using it

- Add `--p` and the moodboard's ID to a prompt, or **Add --p to the imagine bar**.
- Or mark it as a default and turn on personalization next to the bar to add it to every prompt.

When a moodboard is used, its images (up to four) become [style references](#style-reference) for the job, its style words are added to the prompt, and the mix of any profile used with it is added to `--sref`. Each use is saved as a version code, so changing the moodboard later does not change old jobs.

With your own workflows, the moodboard's images arrive as `{{style_image}}` and its code as `{{moodboard}}`. See [Custom Workflows](#custom-workflows).
