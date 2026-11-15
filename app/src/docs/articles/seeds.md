# Seeds

The seed is the starting noise of an image. The same prompt, settings and seed make the same image again.

Without `--seed`, every job gets a random seed. The images of a job use the seed, the seed + 1, and so on. Copy a job's seed from **More › Copy seed** in the lightbox.

```prompt
a red fox sitting in tall autumn grass --seed 1114088342
```

## When to use it

- To change one word of a prompt and compare, keeping everything else.
- To make the same image at another [resolution](#resolution).

[Repeat](#repeat) and [permutations](#permutations) use a new seed for each job unless the prompt has `--seed`.
