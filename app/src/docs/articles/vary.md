# Vary

Vary makes new versions of an image that keep its composition and change the details. Subtle changes little; Strong changes more.

![The original](cabin.webp)
![Vary (Subtle)](vary-subtle.webp)
![Vary (Strong)](vary-strong.webp)

## How to use it

Hover over an image and click **V·subtle** or **V·strong**, or open it and use **Vary › Subtle** or **Strong**. The new job uses the image's prompt and makes as many images as the bar's **Images per creation**.

## How it works

Vary redraws the image starting partway through H3 Image's sampling: Subtle starts late (most of the image is kept), Strong starts earlier. [Variety](#variety) (`--c`) moves both starting points earlier, so higher variety changes more.

A Vary of a [draft](#draft-mode) comes back at full size.

To change the prompt while varying, use [Remix](#remix).
