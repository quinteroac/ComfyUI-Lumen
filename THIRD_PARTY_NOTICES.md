# Third-party notices

Lumen includes code and data from the projects below, so its built-in workflows run without installing them. Each
part keeps its own license; the full texts are at the end of this file and in `licenses/`.

## Code

| In Lumen | From | License |
| --- | --- | --- |
| `nodes/h3_styles.py`, `nodes/style_codes.py` | [ComfyUI-MiniMax-H3-Concept-Sliders](https://github.com/quinteroac/ComfyUI-MiniMax-H3-Concept-Sliders), Copyright (c) 2026 quinteroac | MIT |
| `nodes/moss_styles.py`, `nodes/style_codes.py` | [ComfyUI-MOSS-Concept-Sliders](https://github.com/quinteroac/ComfyUI-MOSS-Concept-Sliders), Copyright (c) 2026 quinteroac | MIT |
| `nodes/anima_styles.py`, `nodes/style_codes.py` | [ComfyUI-Anima-Tag-Sliders](https://github.com/quinteroac/ComfyUI-Anima-Tag-Sliders), Copyright (c) 2026 quinteroac | MIT |
| `nodes/video_continuation.py` | [ComfyUI-MiniMaxH3-PrefixStream](https://github.com/knoic/ComfyUI-MiniMaxH3-PrefixStream), Copyright (c) 2026 knoic | MIT |
| `nodes/snapref.py` | [SnapRef](https://github.com/ArcAnima/SnapRef) by ArcAnima | Apache-2.0 (`licenses/Apache-2.0.txt`) |

Changes made in Lumen:

- The sliders: only the Style Code and single Concept/Tag Slider nodes, renamed `Lumen…`, with the inputs Lumen sends; the Anima guidance mode, curves, NAG and reference sliders are left out. The per-token keys Lumen adds are prefixed `lumen_`.
- PrefixStream: only the Native Masked AV continuation, rewritten as three nodes (save latent, continuation, stitch) with its default settings. The AV latent file format is unchanged.
- SnapRef: only the advanced node's adapter, attention and reference encoding, as one node with the image, mode and fidelity inputs; ref_guidance, captions, stitching and batch options are left out. Attributes and keys it leaves on shared objects are prefixed `lumen_`.

## Data

| In Lumen | From | License |
| --- | --- | --- |
| `nodes/data/styles.json`, `nodes/data/anima_styles.json` | Style ids, names and categories from [comfyui-stylebook](https://github.com/EnragedAntelope/comfyui-stylebook), Copyright (c) 2026 EnragedAntelope; the descriptions were rewritten for each model in the slider packs above | MIT |
| `nodes/data/anima_artists.txt` | The artist list of the Anima 2B artist index by ThetaCursed, [Anima-Style-Explorer](https://github.com/ThetaCursed/Anima-Style-Explorer), as bundled with Anima-Artist-Mixer | MIT |
| `app/src/comfy/h3_video_guide.txt`, `app/src/comfy/h3_video_ref_guide.txt` | MiniMax's video prompt guides `base-en.txt` and `ref-en.txt` ([MiniMax-H3, skills/h3-prompt-writing](https://github.com/MiniMax-AI/MiniMax-H3)) | MiniMax H3 Community License Agreement |
| `app/src/comfy/h3_edit_task_prompt.txt` | The image-editing task prompt of [MiniMax-H3-Image-PE](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image-PE) | MiniMax-H3-Image Community License Agreement |

MiniMax H3 is licensed under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.
The agreement is at https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE.

MiniMax-H3-Image is licensed under the MiniMax-H3-Image Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.
The agreement is at https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE.

## Acknowledgements

- The masked audio-video continuation follows [Herrgott's H3 Infinite Continuation Suite](https://github.com/HerrgottMargott/Herrgotts-H3-Infinite-Continuation-Suite), which PrefixStream credits for the approach.
- The SnapRef adapter weights are a derivative of CircleStone Labs' [Anima](https://huggingface.co/circlestone-labs/Anima) and are under the CircleStone Labs Non-Commercial License; they are downloaded separately and not included in Lumen.
- The models Lumen uses by default (MiniMax H3 Image and Video, Anima, MOSS Image, RelayVSR, Qwen 3.5) are downloaded separately under their own licenses.

## MIT License

The MIT-licensed parts above are under this license, with the copyright lines given in their rows.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
