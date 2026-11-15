# Permutation Prompts

Put options in braces, separated by commas, and Lumen runs one job for each option.

```prompt
a {red, blue, golden} hummingbird hovering by a white flower, macro photograph --draft
```

![red](perm-red.webp)
![blue](perm-blue.webp)
![golden](perm-golden.webp)

## Rules

- Each set of braces multiplies the jobs: `a {red, blue} {bird, fish}` makes four.
- Braces can be nested, and they work in parameters too: `--ar {1:1, 16:9}`.
- Lumen tells you how many prompts the permutation made before running them.

> **Tip:** Combine permutations with [style codes](#style-codes) to compare styles side by side: `a cabin in the snow --sref {2026, 3141, 1001}`.
