# Repeat

`--r` runs the same prompt several times, up to 40, each as its own job with a new seed.

```prompt
a paper boat on a puddle after rain --r 3 --draft
```

Jobs run one after another; you can keep working while they finish. `--r` only applies to new images and videos: Vary, Upscale, Zoom out, Remix and the other actions on one of the results make a single job. With [`--sref random`](#style-codes), each repeat picks its own style code.

Add `--seed` to repeat with the same seed, for example to compare settings.
