"""The nodes Lumen's built-in workflows need beyond core ComfyUI, so installing Lumen is enough.
Where each comes from is in THIRD_PARTY_NOTICES.md."""
from comfy_api.latest import ComfyExtension

from . import anima_styles, h3_styles, moss_styles, snapref, video_continuation


class LumenExtension(ComfyExtension):
    async def get_node_list(self):
        return [*h3_styles.NODES, *moss_styles.NODES, *anima_styles.NODES, snapref.LumenSnapRef, *video_continuation.NODES]
