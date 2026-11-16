"""Downloads Lumen's default models when the user asks for them on the ComfyUI page of the app.

Only the files in MODELS are fetched, each from its fixed URL into its ComfyUI model folder, one at a time, and kept
only if its size and SHA-256 match. Nothing is downloaded on its own and no other request is made.
"""
import asyncio
import hashlib
import os
import shutil

import aiohttp
import folder_paths
from aiohttp import web
from server import PromptServer

routes = PromptServer.instance.routes
HF = "https://huggingface.co"
CHUNK = 8 * 1024 * 1024

# name: the file under its model folder, as Lumen's defaults load it.
MODELS = [
    {"id": "h3_image", "group": "H3 Image", "kind": "diffusion_models", "name": "minimax/minimax_h3_image_pruned_int8_convrot.safetensors",
     "url": f"{HF}/Comfy-Org/MiniMax-H3-Image/resolve/main/diffusion_models/minimax_h3_image_pruned_int8_convrot.safetensors",
     "size": 20979314802, "sha256": "83eb140f1ff95c068f8a6886e6d3f3d0d4ab2e07bb2fe6d2ef992a51146ee622"},
    {"id": "h3_text_encoder", "group": "H3 Image", "kind": "text_encoders", "name": "minimax/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
     "url": f"{HF}/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
     "size": 15687142551, "sha256": "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6"},
    {"id": "h3_image_vae", "group": "H3 Image", "kind": "vae", "name": "minimax/minimax_h3_image_vae_fp16.safetensors",
     "url": f"{HF}/Comfy-Org/MiniMax-H3-Image/resolve/main/vae/minimax_h3_image_vae_fp16.safetensors",
     "size": 1168505312, "sha256": "d80e9c2e5cfc9844869961ff5a58c9a9e52182df6bfb30b26018dd7f348721af"},
    {"id": "enhancer", "group": "H3 Image", "kind": "text_encoders", "name": "moss/qwen3.5_9b_w4a8_gptq.safetensors",
     "url": f"{HF}/Comfy-Org/MOSS-Image/resolve/main/text_encoders/qwen3.5_9b_w4a8_gptq.safetensors",
     "size": 7343591088, "sha256": "4cc6a1543ad2061806da46f35f90cadb4801dcba246c44782cf42ec0feb6407c"},
    {"id": "fl2va", "group": "Video", "kind": "diffusion_models", "name": "minimax/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
     "url": f"{HF}/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
     "size": 20970379616, "sha256": "e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a"},
    {"id": "ref2va", "group": "Video", "kind": "diffusion_models", "name": "minimax/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
     "url": f"{HF}/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
     "size": 20970379616, "sha256": "9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779"},
    {"id": "pika_fl2va", "group": "Video", "kind": "loras", "name": "minimax/pika/pika_h3_flex_fl2va_comfy_bf16.safetensors",
     "url": f"{HF}/Pika-Labs/Pika-H3-Flex/resolve/main/comfy/loras/pika_h3_flex_fl2va_comfy_bf16.safetensors",
     "size": 1956172176, "sha256": "68783e6447696ec365d13c0554941e070bee4cfea13c37da52498ec4f9a53f89"},
    {"id": "pika_ref2va", "group": "Video", "kind": "loras", "name": "minimax/pika/pika_h3_flex_ref2va_comfy_bf16.safetensors",
     "url": f"{HF}/Pika-Labs/Pika-H3-Flex/resolve/main/comfy/loras/pika_h3_flex_ref2va_comfy_bf16.safetensors",
     "size": 1956172176, "sha256": "e4d058fbd027377b925a0ee607b514ddd9037873fee3afa05d73b302e6f7f8e1"},
    {"id": "video_vae", "group": "Video", "kind": "vae", "name": "minimax/minimax_h3_video_vae_int8_convrot.safetensors",
     "url": f"{HF}/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_int8_convrot.safetensors",
     "size": 2811065184, "sha256": "52a2c8c73583c86e4f41cdcce3a6ad0ea562987bc0bf3d60a0cef5f5c8e60c0e"},
    {"id": "audio_vae", "group": "Video", "kind": "vae", "name": "minimax/minimax_h3_audio_vae_fp32.safetensors",
     "url": f"{HF}/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
     "size": 605254808, "sha256": "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48"},
    {"id": "relayvsr", "group": "Video", "kind": "diffusion_models", "name": "relayvsr/relayvsr_x2_lightx2v_int8_convrot.safetensors",
     "url": f"{HF}/Comfy-Org/RelayVSR/resolve/main/diffusion_models/relayvsr_x2_lightx2v_int8_convrot.safetensors",
     "size": 5163295248, "sha256": "240e75e0c17cf2845d559b25254a230ff7458f81449d7a8c5e7e3fb8275c7b3c"},
    {"id": "relayvsr_vae", "group": "Video", "kind": "vae", "name": "relayvsr/relayvsr_flash_vae_x2_fp32.safetensors",
     "url": f"{HF}/Comfy-Org/RelayVSR/resolve/main/vae/relayvsr_flash_vae_x2_fp32.safetensors",
     "size": 127759464, "sha256": "b5bb0339acb5b52545911ea29a51b4c5b805776a779222b5a14591571f42e21c"},
    {"id": "recavsr", "group": "Video", "kind": "diffusion_models", "name": "recavsr/recavsr_transformer_int8_convrot.safetensors",
     "url": f"{HF}/paralaif/ReCaVSR-comfy-int8-convrot/resolve/main/recavsr_transformer_int8_convrot.safetensors",
     "size": 6266935016, "sha256": "3a5994ba9895e82e400de7586449678b44796e94827fc90ef2713b45d243f23a"},
    {"id": "recavsr_prompt", "group": "Video", "kind": "diffusion_models", "name": "recavsr/recavsr_prompt.safetensors",
     "url": f"{HF}/kopper/ReCaVSR/resolve/main/prompt.safetensors",
     "size": 4194392, "sha256": "325ee3b5ec7d8bd43bc7ab186be5272dec0877c04e7c01a46fd0893260c9c6a5"},
    {"id": "recavsr_decoder", "group": "Video", "kind": "vae", "name": "recavsr/recavsr_flashdecoder_fp32.safetensors",
     "url": f"{HF}/kopper/ReCaVSR/resolve/main/flashdecoder.safetensors",
     "size": 228723776, "sha256": "f4feb3e7b0b65f98e15bb709a1ba28dfaada7c06bf7fc0ce4cdbcb58803034e8"},
    {"id": "anima", "group": "Anima", "kind": "diffusion_models", "name": "anima/anima-base-v1.0.safetensors",
     "url": f"{HF}/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors",
     "size": 4182218328, "sha256": "bd43b7cffe1ed1153d9c41e7beb2f18cb1273eafbaa3af3edd6a173dc90a006e"},
    {"id": "anima_turbo", "group": "Anima", "kind": "loras", "name": "anima/anima-turbo-lora-v0.2.safetensors",
     "url": "https://civitai.com/api/download/models/2979642?fileId=2859181",
     "page": "https://civitai.com/models/2560840/anima-turbo-lora",
     "size": 148902616, "sha256": "1b55e40bdb1d0e5a78cb498f245fccfdaae97823265db957d2aabdcf4cd3caf1"},
    {"id": "anima_text_encoder", "group": "Anima", "kind": "text_encoders", "name": "qwen_3_06b_base.safetensors",
     "url": f"{HF}/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors",
     "size": 1192135096, "sha256": "cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba"},
    {"id": "anima_vae", "group": "Anima", "kind": "vae", "name": "qwen_image_vae.safetensors",
     "url": f"{HF}/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors",
     "size": 253806246, "sha256": "a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f"},
    {"id": "snapref", "group": "Anima", "kind": "loras", "name": "snapref_v2a_pre2.safetensors",
     "url": f"{HF}/0ppxnhximxr/snapref-v2a-pre2/resolve/main/snapref_v2a_pre2.safetensors",
     "size": 381821960, "sha256": "1c9794ac626551654aa0bf08028e70a451eda4229878a7ea00490b4cc72edaa8"},
    {"id": "moss", "group": "MOSS Image", "kind": "diffusion_models", "name": "moss/moss_image_sft_int8_convrot.safetensors",
     "url": f"{HF}/Comfy-Org/MOSS-Image/resolve/main/diffusion_models/moss_image_sft_int8_convrot.safetensors",
     "size": 5413698958, "sha256": "b4d1475bc7eeffd7b809e82ea13a1fba1fb85c4e18365af3813722faa5c0fe4f"},
    {"id": "moss_dmd", "group": "MOSS Image", "kind": "loras", "name": "moss/moss_image_sft_8step_dmd.safetensors",
     "url": f"{HF}/lodestones/MOSS-Image-SFT-8-steps-dmd/resolve/main/lora.safetensors",
     "size": 1189176800, "sha256": "4abb14e39c1a59018907581e609f43616ec6810126144ec2b1d2e6f8969628fe"},
    {"id": "moss_text_encoder", "group": "MOSS Image", "kind": "text_encoders", "name": "moss/qwen3.5_9b_int8_convrot.safetensors",
     "url": f"{HF}/Comfy-Org/MOSS-Image/resolve/main/text_encoders/qwen3.5_9b_int8_convrot.safetensors",
     "size": 9748121532, "sha256": "32e3787472f708fa5f83624acbf5ef23f7fc89c439e05065ea57cfe5a97f025a"},
    {"id": "moss_vae", "group": "MOSS Image", "kind": "vae", "name": "flux2-vae.safetensors",
     "url": f"{HF}/Comfy-Org/ERNIE-Image/resolve/main/vae/flux2-vae.safetensors",
     "size": 336213556, "sha256": "d64f3a68e1cc4f9f4e29b6e0da38a0204fe9a49f2d4053f0ec1fa1ca02f9c4b5"},
]
BY_ID = {m["id"]: m for m in MODELS}
LOCK = asyncio.Lock()
# id -> {"state": queued | downloading | error, "done": bytes, "error": text}; finished downloads leave the table.
STATUS = {}
TASKS = {}


def roots():
    """The folders that hold ComfyUI's model folders: models/ and those of extra_model_paths.yaml."""
    output = os.path.abspath(folder_paths.get_output_directory())
    found = []
    for kind in {m["kind"] for m in MODELS}:
        for path in folder_paths.get_folder_paths(kind):
            # ComfyUI also looks for LoRAs in the output folder (trained ones); models are not saved there.
            if os.path.abspath(path).startswith(output):
                continue
            root = os.path.dirname(os.path.normpath(path))
            if root not in found:
                found.append(root)
    return found


def destination(model, root):
    paths = folder_paths.get_folder_paths(model["kind"])
    folder = next((p for p in paths if os.path.dirname(os.path.normpath(p)) == root), next(p for p in paths if os.path.dirname(os.path.normpath(p)) in roots()))
    return os.path.join(folder, model["name"])


def installed(model):
    return folder_paths.get_full_path(model["kind"], model["name"]) is not None


def store(f, digest, chunk):
    f.write(chunk)
    digest.update(chunk)


async def fetch(model, path):
    part = path + ".part"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if shutil.disk_usage(os.path.dirname(path)).free < model["size"]:
        raise ValueError(f"Not enough free space in {os.path.dirname(path)}.")
    digest = hashlib.sha256()
    status = STATUS[model["id"]]
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, sock_read=120)) as session:
            async with session.get(model["url"]) as response:
                if response.status in (401, 403):
                    raise ValueError(f"The site asked for a login. Download it from {model.get('page', model['url'])} and put it in {os.path.dirname(path)}.")
                response.raise_for_status()
                with open(part, "wb") as f:
                    async for chunk in response.content.iter_chunked(CHUNK):
                        # Writing and hashing gigabytes stays off the server's event loop.
                        await asyncio.to_thread(store, f, digest, chunk)
                        status["done"] += len(chunk)
        if status["done"] != model["size"] or digest.hexdigest() != model["sha256"]:
            raise ValueError("The downloaded file does not match the expected one; it was deleted.")
        os.replace(part, path)
    finally:
        if os.path.exists(part):
            os.remove(part)


async def run(model, path):
    try:
        async with LOCK:
            STATUS[model["id"]]["state"] = "downloading"
            await fetch(model, path)
        STATUS.pop(model["id"], None)
    except asyncio.CancelledError:
        STATUS.pop(model["id"], None)
        raise
    except (aiohttp.ClientError, OSError, ValueError, asyncio.TimeoutError) as error:
        STATUS[model["id"]] = {"state": "error", "done": 0, "error": str(error) or type(error).__name__}
    finally:
        TASKS.pop(model["id"], None)


@routes.get("/lumen/models")
async def list_models(request):
    return web.json_response({"roots": roots(), "models": [
        {**{k: m[k] for k in ("id", "group", "kind", "name", "size", "url")}, "page": m.get("page"), "installed": installed(m), "status": STATUS.get(m["id"])}
        for m in MODELS]})


@routes.post("/lumen/models/download")
async def download(request):
    body = await request.json()
    model = BY_ID.get(body.get("id"))
    if model is None:
        return web.json_response({"error": "Unknown model."}, status=400)
    root = body.get("root")
    if root not in roots():
        root = roots()[0]
    if not installed(model) and model["id"] not in TASKS:
        STATUS[model["id"]] = {"state": "queued", "done": 0}
        TASKS[model["id"]] = asyncio.create_task(run(model, destination(model, root)))
    return web.json_response({"ok": True})


@routes.post("/lumen/models/cancel")
async def cancel(request):
    task = TASKS.get((await request.json()).get("id"))
    if task:
        task.cancel()
    return web.json_response({"ok": True})
