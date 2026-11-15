# Variety

`--c` (chaos) sets how far [Vary](#vary) moves from the image, from 0 to 100. The default is 0.

```prompt
a cozy wooden cabin in a snowy forest at dusk --c 50
```

Vary redraws an image from a point partway through its sampling. Higher variety starts that redraw earlier, so more of the image changes: each 25 points of variety start it roughly one step earlier.

You can also set it for every prompt with **Variety** in the bar's settings.

> **Note:** Variety only affects Vary in Lumen. To get images that differ more from each other in a new job, change the prompt or use [permutations](#permutations).
