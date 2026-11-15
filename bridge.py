"""How mcp/server.mjs reaches Lumen.

The MCP server posts a command to /lumen/mcp/call. The open Lumen page long-polls /lumen/mcp/next, runs the command as
its buttons would and posts the answer to /lumen/mcp/result, which /lumen/mcp/call returns. /lumen/mcp/thumb gives
small JPEG previews of Lumen's images, and of a video four frames in a 2x2 grid.
"""
import asyncio
import itertools
import time
from io import BytesIO
from pathlib import Path

import av
import folder_paths
from aiohttp import web
from PIL import Image
from server import PromptServer

routes = PromptServer.instance.routes
COMMANDS = asyncio.Queue()
ANSWERS = {}
IDS = itertools.count(1)
POLL_SECONDS = 20
ANSWER_SECONDS = 60
VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".mkv"}
POLLS = []
last_poll = 0.0


def connected(request):
    return request.transport is not None and not request.transport.is_closing()


def page_open():
    return any(connected(r) for r in POLLS) or time.monotonic() - last_poll < 5


@routes.post("/lumen/mcp/call")
async def mcp_call(request):
    if not page_open():
        return web.json_response({"error": "Lumen is not open. Open it in ComfyUI (Lumen in the menu or sidebar) and try again."}, status=503)
    body = await request.json()
    command_id = next(IDS)
    ANSWERS[command_id] = asyncio.get_running_loop().create_future()
    await COMMANDS.put({"id": command_id, "command": body.get("command"), "args": body.get("args") or {}})
    try:
        answer = await asyncio.wait_for(ANSWERS[command_id], ANSWER_SECONDS)
    except asyncio.TimeoutError:
        return web.json_response({"error": "Lumen did not answer."}, status=504)
    finally:
        ANSWERS.pop(command_id, None)
    return web.json_response(answer, status=400 if "error" in answer else 200)


@routes.get("/lumen/mcp/next")
async def mcp_next(request):
    global last_poll
    POLLS.append(request)
    try:
        while True:
            command = await asyncio.wait_for(COMMANDS.get(), POLL_SECONDS)
            # A command whose caller gave up is dropped; one for a page that has gone waits for another page.
            if command["id"] not in ANSWERS:
                continue
            if not connected(request):
                COMMANDS.put_nowait(command)
                return web.Response(status=204)
            return web.json_response(command)
    except asyncio.TimeoutError:
        return web.Response(status=204)
    finally:
        POLLS.remove(request)
        if connected(request):
            last_poll = time.monotonic()


@routes.post("/lumen/mcp/result")
async def mcp_result(request):
    body = await request.json()
    future = ANSWERS.get(body.get("id"))
    if future and not future.done():
        future.set_result({"error": body["error"]} if body.get("error") else {"result": body.get("result")})
    return web.Response(status=204)


def video_frames(path, count):
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        total = stream.frames or sum(1 for _ in container.decode(stream))
        wanted = {round(n * (total - 1) / (count - 1)) for n in range(count)}
        container.seek(0)
        return [frame.to_image() for n, frame in enumerate(container.decode(stream)) if n in wanted]


def thumbnail(path, size):
    if path.suffix.lower() in VIDEO_SUFFIXES:
        frames = video_frames(path, 4)
        for frame in frames:
            frame.thumbnail((size // 2, size // 2))
        w, h = frames[0].size
        image = Image.new("RGB", (2 * w, 2 * h))
        for n, frame in enumerate(frames):
            image.paste(frame, (n % 2 * w, n // 2 * h))
    else:
        with Image.open(path) as source:
            image = source.convert("RGBA")
        image.thumbnail((size, size))
        image = Image.alpha_composite(Image.new("RGBA", image.size, "white"), image).convert("RGB")
    out = BytesIO()
    image.save(out, "JPEG", quality=85)
    return out.getvalue()


@routes.get("/lumen/mcp/thumb")
async def mcp_thumb(request):
    q = request.query
    base = folder_paths.get_directory_by_type(q.get("type", "output"))
    if base is None or "filename" not in q:
        return web.json_response({"error": "Unknown image."}, status=400)
    base = Path(base).resolve()
    path = (base / q.get("subfolder", "") / q["filename"]).resolve()
    if not path.is_relative_to(base) or not path.is_file():
        return web.json_response({"error": "Image not found."}, status=404)
    size = min(max(int(q.get("size", 768)), 64), 2048)
    return web.Response(body=await asyncio.to_thread(thumbnail, path, size), content_type="image/jpeg")
