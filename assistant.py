"""Conversational mode: a local GGUF writes and edits the prompt.

Each turn runs llm_worker.py in a new process with ComfyUI's Python. ComfyUI's models are unloaded first and the
process exits after answering, so the LLM never keeps memory and never shares the GPU with a workflow: turns are
refused while workflows run, and workflows while a turn runs.
"""
import asyncio
import gc
import json
import sys
from pathlib import Path

import comfy.model_management
import folder_paths
from aiohttp import web
from server import PromptServer

WORKER = str(Path(__file__).with_name("llm_worker.py"))
LOCK = asyncio.Lock()
TIMEOUT = 600
routes = PromptServer.instance.routes

SYSTEM = """You are the assistant of Lumen, an image studio that renders with MiniMax H3 Image (and Anima or MOSS Image with --anima or --moss). The user tells you, in any language, what they want to see or what to change.

prompt: the complete prompt to render, in English, as one paragraph of natural prose: first the kind of image (a photograph, an anime illustration, an oil painting...), then the subject and how it looks, what it is doing, the setting, the framing and camera angle, the light, and the style and colors. No lists of tags, no hype or quality words. Parameters go at the end, such as --ar 16:9 for a shape (vertical 2:3, square 1:1, wide 16:9) or the --sref, --anima, --moss and --draft the user asks for. When there is a current prompt and the user asks for a change, edit it: change only what they ask and keep the rest, parameters included. If the message asks for no image (a question, a greeting), return an empty prompt.

image_action: when the user asks to act on one of the images of the last result (a variation, more variation, upscale, animate; "image 2"), set kind to vary_subtle, vary_strong, upscale_subtle or animate and image to its number from 1, and return the current prompt unchanged. Otherwise kind is none and image is 0.

reply: one or two short sentences to the user, in their language, saying what you did or answering them."""


def roots():
    """Where GGUF files are looked for: models/LLM and any registered LLM folders."""
    paths = [Path(folder_paths.models_dir) / "LLM"]
    if "LLM" in folder_paths.folder_names_and_paths:
        paths += [Path(p) for p in folder_paths.get_folder_paths("LLM")]
    return list(dict.fromkeys(p.resolve() for p in paths if p.is_dir()))


def gguf_files():
    """Language models by their path under an LLM folder; vision projectors are left out."""
    return sorted({str(path.relative_to(root)) for root in roots() for path in root.rglob("*.gguf") if not path.name.startswith("mmproj")})


class MissingModel(ValueError):
    pass


def model_path(name):
    for root in roots():
        path = (root / name).resolve()
        if path.is_relative_to(root) and path.is_file():
            return path
    raise MissingModel(name)


def failure(code, message, status, **details):
    """An error the page shows in its own language by code; message is the English fallback."""
    return web.json_response({"error": message, "code": code, **details}, status=status)


def settings_of(body):
    s = body.get("settings") or {}
    return {
        "n_gpu_layers": int(s.get("n_gpu_layers", -1)),
        "n_ctx": max(1024, int(s.get("n_ctx", 8192))),
        "max_tokens": max(64, int(s.get("max_tokens", 1024))),
        "temperature": float(s.get("temperature", 0.7)),
    }


def workflow_busy():
    return PromptServer.instance.prompt_queue.get_tasks_remaining() > 0


def free_gpu():
    comfy.model_management.unload_all_models()
    gc.collect()
    comfy.model_management.soft_empty_cache()


@web.middleware
async def guard_workflows(request, handler):
    if request.method == "POST" and request.path in ("/prompt", "/api/prompt") and LOCK.locked():
        return web.json_response({"error": {"type": "lumen_assistant_busy", "message": "Lumen's assistant is using the GPU; wait for its answer.",
                                            "details": "", "extra_info": {}}, "node_errors": {}}, status=409)
    return await handler(request)


PromptServer.instance.app.middlewares.append(guard_workflows)


@routes.get("/lumen/llm/models")
async def llm_models(request):
    return web.json_response(gguf_files())


@routes.post("/lumen/assistant")
async def assistant(request):
    try:
        body = await request.json()
        path = model_path(str(body["model"]))
        settings = settings_of(body)
        message = str(body["message"]).strip()
    except MissingModel as error:
        return failure("model_missing", f"GGUF model {error} is not in models/LLM. Pick it on Lumen's ComfyUI page.", 400, name=str(error))
    except (ValueError, KeyError, TypeError) as error:
        return web.json_response({"error": str(error)}, status=400)
    if LOCK.locked() or workflow_busy():
        return failure("busy", "ComfyUI is generating; the assistant answers when the queue is done.", 409)
    context = f"Current prompt: {body.get('current_prompt') or '(none)'}\nImages in the last result: {int(body.get('images', 0))}\n\nMessage: {message}"
    payload = {"model_path": str(path), "settings": settings,
               "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": context}]}
    async with LOCK:
        await asyncio.to_thread(free_gpu)
        process = await asyncio.create_subprocess_exec(sys.executable, "-u", WORKER, stdin=asyncio.subprocess.PIPE,
                                                       stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            out, err = await asyncio.wait_for(process.communicate((json.dumps(payload) + "\n").encode()), TIMEOUT)
        except asyncio.TimeoutError:
            return failure("timeout", "The assistant took too long and was stopped.", 504)
        finally:
            # A timeout or a closed page stops the worker; its exit frees the model.
            if process.returncode is None:
                process.kill()
                await process.wait()
    if process.returncode != 0:
        await asyncio.to_thread(free_gpu)
        tail = err.decode(errors="replace").strip().splitlines()[-4:]
        return failure("failed", "The GGUF model failed: " + " ".join(tail), 500, detail=" ".join(tail))
    return web.json_response(json.loads(out.decode().strip().splitlines()[-1]))
