# The Imagine Bar

The imagine bar is where every creation starts: a prompt, the pictures that go with it and the settings for the next job.

## Writing and sending

Type a prompt and press **Enter**. **Ctrl+Enter** sends it and keeps the text in the bar so you can change one word and send again. [Parameters](#parameter-list) go at the end of the prompt.

## Buttons

| Button | What it does |
| --- | --- |
| Image | Opens the picture zones (below). |
| Speech bubble | [Conversational mode](#conversational-mode): describe your idea and a local LLM writes the prompt. |
| Sparkles | [Personalization](#personalization): turns your default profiles and moodboards on or off, and picks them. |
| Lightning | [Draft mode](#draft-mode): small, fast images. |
| Camera | Video mode: the bar makes [videos](#video-basics) instead of images. |
| Sliders | Creation settings (below). |

## Pictures

Drag images onto a zone, or press **+** to upload (10 MB at most per image). You can also send images here from any result with **Use › Image** or **Use › Style**.

| Zone | Used as |
| --- | --- |
| Image prompt | Subject, composition and colors. See [Image Prompts](#image-prompts). |
| Style reference | The look only. See [Style Reference](#style-reference). |
| Character (--cref) | A person or character to keep. See [Character Reference](#character-reference). |
| Start frame | Makes the job [Animate](#animate) this picture. |
| End frame | The frame the video ends on. |

**Pin** keeps the pictures for the next prompts; otherwise the zones are cleared after sending.

## Creation settings

| Setting | Values |
| --- | --- |
| Orientation and aspect ratio | Portrait, square or landscape, and the exact ratio. Same as [--ar](#aspect-ratio). |
| Variety | 0–100, how far [Vary](#vary) moves. Same as [--c](#variety). |
| Image resolution | SD or HD. See [Resolution](#resolution). |
| Images per creation | 1–4, made one after another. |
| Video resolution, batch and motion | SD or HD, videos per prompt, low or high motion. See [Video](#video-basics). |

A parameter in the prompt always wins over the bar's setting for that job.
