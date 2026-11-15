# Aspect Ratio

`--ar` sets the shape of the image as width:height. The default is 1:1, or the ratio chosen in the bar's settings.

```prompt
a red fox sitting in tall autumn grass, golden hour wildlife photograph --ar 2:3
```

![--ar 1:1](ar-1x1.webp)
![--ar 2:3](ar-2x3.webp)
![--ar 16:9](ar-16x9.webp)

## How it works

- Use whole numbers: `--ar 16:9`, `--ar 4:5`, `--ar 21:9`. Decimals such as `1.5:1` are ignored.
- Lumen keeps the megapixels of the [resolution](#resolution) and rounds each side to a multiple of 32, so the exact pixels may differ slightly from the ratio.
- Common ratios: 1:1 square, 4:5 and 2:3 portrait, 3:2 and 16:9 landscape, 9:16 for phone screens, 21:9 for wide banners.

The orientation buttons in the bar's settings set the same thing for every prompt without typing it.
