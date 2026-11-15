from pathlib import Path

from aiohttp import web

from server import PromptServer

from . import assistant, bridge  # noqa: F401  (register the conversational and MCP routes)

DIST = Path(__file__).parent / "dist"
routes = PromptServer.instance.routes


@routes.get("/lumen")
async def lumen_root(request):
    raise web.HTTPFound("/lumen/")


@routes.get("/lumen/{path:.*}")
async def lumen_page(request):
    # Built assets are served as they are; any other path is a page of the app.
    file = (DIST / request.match_info["path"]).resolve()
    if file.is_relative_to(DIST) and file.is_file():
        return web.FileResponse(file)
    return web.FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})


WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS"]
