# Weird

`--w` makes a new image less conventional: the subject repeats, multiplies and rearranges, and the camera pulls back. The default is 0.

```prompt
a still life of lemons, a blue ceramic jug and a folded linen cloth on a wooden table --w 1000
```

Lumen adds the whole prompt again as a [weighted part](#multi-prompts) with the model's concept slider. Each model has its own scale, so the same value gives a similar amount of change:

| Model | Slider strength | Mode |
| --- | --- | --- |
| H3 Image | 1 + w × 0.02 (`--w 1000` is 21) | attention |
| MOSS Image | 1 + w × 0.01 (`--w 1000` is 11) | attention |
| Anima | 1 + w × 0.004 (`--w 1000` is 5) | weight_norm |

- Values from 250 to 3000 are a good range to try; there is no upper limit.
- High values can break the image: Anima turns into a smeared painting above about `--w 5000`, and H3 into grids of the subject above about `--w 2000`.
- `--w` only applies to new images, not to edits, and only reads the prompt text, not the parts with their own weight.
