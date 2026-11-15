"""Extend for MiniMax H3 videos: save a video's AV latent, start a new clip from its tail, and join the clips.

From ComfyUI-MiniMaxH3-PrefixStream by knoic (MIT): its Native Masked AV continuation (the previous latent's tail is
copied into the new clip's head and frozen with ComfyUI's native video and audio denoise masks), the AV latent file
format and the pixel/waveform stitch, with the settings Lumen uses. PrefixStream credits Herrgott's H3 Infinite
Continuation Suite for the masked approach. See THIRD_PARTY_NOTICES.md.
"""
import json
import math
import os

import torch
from safetensors import safe_open
from safetensors.torch import load_file, save_file

import comfy.nested_tensor
import folder_paths
from comfy_api.latest import io

FPS = 24
AUDIO_HZ = 40
# Pixel frames per video latent step: H3 packs frames on a 1, 4, 4, 4, 4 cycle (17k + 5 frames).
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
STATE_KEYS = ("minimax_video_start_step", "minimax_audio_start_tick")
ANCHOR_KEY = "minimax_identity_anchor"
REFERENCES_KEY = "minimax_identity_refs"
MANIFEST_KEY = "minimax_identity_refs_json"
CROSSFADE_FRAMES = 4
LUMINANCE_FADE_FRAMES = 16
CROSSFADE_MS = 15.0


def output_path(relative):
    """A path under ComfyUI's output folder; anything outside it is refused."""
    base = os.path.abspath(folder_paths.get_output_directory())
    path = os.path.abspath(os.path.join(base, relative))
    if os.path.commonpath((base, path)) != base:
        raise ValueError(f"{relative} is outside ComfyUI's output folder.")
    return path


def av_streams(latent):
    video, audio = latent["samples"].unbind()
    return video, audio


def latent_boundaries(steps, start_step=0):
    """Exclusive pixel-frame boundaries of an H3 video latent."""
    boundaries = [0]
    for step in range(int(steps)):
        boundaries.append(boundaries[-1] + FRAME_PER_TOKEN[(start_step + step) % 5])
    return boundaries


def tail_slice(source_steps, context_frames, target_steps, source_start_step):
    """The latest source tail on H3's frame grid that fits in the target and leaves it new frames."""
    source = latent_boundaries(source_steps, source_start_step)
    cap = min(context_frames, source[-1], latent_boundaries(target_steps)[-1] - 1)
    if cap < 5:
        raise ValueError("Extend needs at least 5 frames of the previous video and a clip longer than 5 frames.")
    frames = 5 + ((cap - 5) // 17) * 17
    steps = 2 + 5 * ((frames - 5) // 17)
    for end in range(source_steps, steps - 1, -1):
        if (source_start_step + end) % 5 == 2 and (source_start_step + end - steps) % 5 == 0:
            return {"start_t": end - steps, "end_t": end, "steps": steps, "frames": frames,
                    "start_frame": source[end - steps], "end_frame": source[end]}
    raise ValueError("The previous video's latent has no tail aligned to H3's frame grid.")


def masked_continuation(target_video, target_audio, source_video, source_audio, context_frames, source_start_step, source_audio_start_tick):
    """The target with the source's tail copied into its head, and denoise masks that keep that head."""
    plan = tail_slice(source_video.shape[2], context_frames, target_video.shape[2], source_start_step)
    # The audio stops where the video hands over; its length is rounded once, then end-aligned.
    audio_steps = round((plan["end_frame"] - plan["start_frame"]) * AUDIO_HZ / FPS)
    origin = latent_boundaries(source_start_step)[-1]
    a1 = min(source_audio.shape[-1], round((origin + plan["end_frame"]) * AUDIO_HZ / FPS) - source_audio_start_tick)
    a0 = max(0, a1 - audio_steps)
    if a1 - a0 >= target_audio.shape[-1]:
        raise ValueError("The kept audio would fill the whole new clip; make the clip longer.")
    video, audio = target_video.clone(), target_audio.clone()
    video[:, :, :plan["steps"]] = source_video[:, :, plan["start_t"]:plan["end_t"]].to(video)
    audio[..., :a1 - a0] = source_audio[..., a0:a1].to(audio)
    video_mask = torch.ones((1, 1, *video.shape[2:]), device=video.device)
    audio_mask = torch.ones((1, 1, *audio.shape[2:]), device=audio.device)
    video_mask[:, :, :plan["steps"]] = 0.0
    audio_mask[..., :a1 - a0] = 0.0
    return video, audio, video_mask, audio_mask, plan["frames"]


def same_image(left, right):
    a, b = left["latent"], right["latent"]
    return a is b or (a.shape == b.shape and torch.equal(a.to(device=b.device), b))


def keep_references(conditioning, previous):
    """The new clip's image references, or the previous clip's when it has none (they travel in the latent)."""
    current = []
    for _, extra in conditioning:
        for ref in extra.get("minimax_refs") or []:
            if ref.get("kind") == "image" and not any(same_image(ref, old) for old in current):
                current.append(dict(ref))
    refs = current or list(previous.get(REFERENCES_KEY) or [])
    state = {REFERENCES_KEY: refs}
    if refs:
        state[ANCHOR_KEY] = refs[0]["latent"]
    if current or not refs:
        return conditioning, state
    out = []
    for embedding, extra in conditioning:
        existing = list(extra.get("minimax_refs") or [])
        added = [ref for ref in refs if not any(old.get("kind") == "image" and same_image(ref, old) for old in existing)]
        if added:
            extra = {**extra, "minimax_refs": [ref for ref in existing if ref.get("kind") == "image"] + added + [ref for ref in existing if ref.get("kind") != "image"]}
        out.append([embedding, extra])
    return out, state


def drop_head_keyframes(conditioning, frames):
    """A keyframe inside the kept head would fight the copied frames."""
    return [[embedding, {**extra, "minimax_keyframes": [dict(kf) for kf in extra.get("minimax_keyframes") or [] if float(kf.get("resolved_frame_index", 0)) >= frames]}]
            for embedding, extra in conditioning]


def save_av_latent(latent, path):
    video, audio = av_streams(latent)
    tensors = {"video": video.detach().cpu().contiguous(), "audio": audio.detach().cpu().contiguous()}
    refs = latent.get(REFERENCES_KEY) or []
    anchor = latent.get(ANCHOR_KEY)
    if anchor is not None and (not refs or anchor is not refs[0]["latent"]):
        tensors[ANCHOR_KEY] = anchor.detach().cpu().contiguous().clone()
    metadata = {key: str(int(latent.get(key, 0))) for key in STATE_KEYS}
    manifest = []
    for index, ref in enumerate(refs):
        key = f"minimax_image_ref_{index}"
        tensors[key] = ref["latent"].detach().cpu().contiguous().clone()
        manifest.append({"tensor": key, "latent_h": ref.get("latent_h", ref["latent"].shape[-2]), "latent_w": ref.get("latent_w", ref["latent"].shape[-1])})
    metadata[MANIFEST_KEY] = json.dumps(manifest)
    metadata["format"] = "minimax_h3_av_latent"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    save_file(tensors, path, metadata=metadata)


def load_av_latent(path):
    tensors = load_file(path, device="cpu")
    with safe_open(path, framework="pt", device="cpu") as f:
        metadata = f.metadata() or {}
    latent = {"samples": comfy.nested_tensor.NestedTensor((tensors["video"], tensors["audio"]))}
    latent.update({key: int(metadata.get(key, 0)) for key in STATE_KEYS})
    refs = [{"kind": "image", "latent": tensors[item["tensor"]], "latent_h": item["latent_h"], "latent_w": item["latent_w"]}
            for item in json.loads(metadata.get(MANIFEST_KEY, "[]"))]
    if ANCHOR_KEY in tensors:
        latent[ANCHOR_KEY] = tensors[ANCHOR_KEY]
    if refs:
        latent[REFERENCES_KEY] = refs
        latent.setdefault(ANCHOR_KEY, refs[0]["latent"])
    return latent


def luminance(images):
    return images[..., 0] * 0.2126 + images[..., 1] * 0.7152 + images[..., 2] * 0.0722


def luminance_gain(previous, following, max_correction=0.1):
    """A conservative global gain that matches the brightness of time-overlapping frames."""
    ratios = []
    for a, b in zip(luminance(previous)[:, ::4, ::4], luminance(following.to(previous.device))[:, ::4, ::4]):
        valid = (a > 0.04) & (a < 0.96) & (b > 0.04) & (b < 0.96)
        if valid.sum() >= max(4, int(valid.numel() * 0.01)) and b[valid].mean() > 1e-6:
            ratios.append(float(a[valid].mean() / b[valid].mean()))
    if not ratios:
        return 1.0
    return min(1.0 + max_correction, max(1.0 - max_correction, float(torch.tensor(ratios).median())))


def stitch_images(previous, current, trim):
    """previous + current without its first trim frames: brightness matched at the seam and a short crossfade."""
    body = current[trim:].to(previous.device, previous.dtype)
    n = min(8, trim, previous.shape[0])
    gain = luminance_gain(previous[-n:], current[trim - n:trim])
    if abs(gain - 1.0) > 1e-6:
        fade = min(LUMINANCE_FADE_FRAMES, body.shape[0])
        scales = 1.0 + (gain - 1.0) * (0.5 + 0.5 * torch.cos(math.pi * torch.linspace(0.0, 1.0, fade, dtype=body.dtype, device=body.device)))
        body = body.clone()
        body[:fade, ..., :3] = (body[:fade, ..., :3] * scales.view(fade, 1, 1, 1)).clamp(0.0, 1.0)
    c = min(CROSSFADE_FRAMES, trim, previous.shape[0])
    overlap = (current[trim - c:trim].to(previous.device, previous.dtype) * gain).clamp(0.0, 1.0)
    alpha = (0.5 - 0.5 * torch.cos(math.pi * torch.linspace(0.0, 1.0, c, dtype=previous.dtype, device=previous.device))).view(c, 1, 1, 1)
    return torch.cat((previous[:-c], previous[-c:] * (1.0 - alpha) + overlap * alpha, body))


def stitch_audio(previous, current, frames, trim, fps):
    """previous + current from the trim point, the seam crossfaded over the audio both clips share."""
    if previous["sample_rate"] != current["sample_rate"]:
        raise ValueError("The two clips have different audio sample rates.")
    sr = current["sample_rate"]
    prev_w = previous["waveform"]
    curr_w = current["waveform"].to(prev_w)
    head = round(trim / fps * sr)
    want = round((frames - trim) / fps * sr)
    body = curr_w[..., head:head + want]
    if body.shape[-1] < want:
        # A short clip ends in silence; its last samples fade out first so the padding does not click.
        fade = min(body.shape[-1], 32)
        body = body.clone()
        body[..., body.shape[-1] - fade:] *= 0.5 + 0.5 * torch.cos(torch.linspace(0.0, math.pi, fade, dtype=body.dtype, device=body.device))
        body = torch.nn.functional.pad(body, (0, want - body.shape[-1]))
    c = min(round(CROSSFADE_MS / 1000.0 * sr), head, prev_w.shape[-1])
    fade_in = torch.sin(torch.linspace(0.0, math.pi / 2, c, dtype=prev_w.dtype, device=prev_w.device)).square()
    blended = prev_w[..., -c:] * (1.0 - fade_in) + curr_w[..., head - c:head] * fade_in
    return {"waveform": torch.cat((prev_w[..., :-c], blended, body), dim=-1), "sample_rate": sr}


class LumenSaveVideoLatent(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenSaveVideoLatent",
            display_name="Lumen Save Video Latent",
            category="Lumen",
            description="Saves a MiniMax H3 audio-video latent so the video can be extended later.",
            inputs=[
                io.Latent.Input("latent"),
                io.String.Input("filename_prefix", default="lumen/latents/video", tooltip="Under ComfyUI's output folder; the file is <prefix>_00001.safetensors."),
            ],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, latent, filename_prefix):
        save_av_latent(latent, output_path(f"{filename_prefix}_00001.safetensors"))
        return io.NodeOutput()


class LumenVideoContinuation(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenVideoContinuation",
            display_name="Lumen Video Continuation",
            category="Lumen",
            description="Starts a new MiniMax H3 clip from the end of a saved video: its last frames and their sound are copied into the clip's head and kept while the rest is generated.",
            inputs=[
                io.Conditioning.Input("conditioning"),
                io.Latent.Input("latent", tooltip="The new clip's empty audio-video latent."),
                io.String.Input("latent_path", tooltip="The saved latent of the video to continue, under ComfyUI's output folder."),
                io.Int.Input("context_frames", default=39, min=5, max=192, step=17, tooltip="Frames of the video kept as the clip's head, on H3's 17k + 5 grid."),
            ],
            outputs=[
                io.Conditioning.Output(),
                io.Latent.Output(),
                io.Int.Output(display_name="prefix_frames", tooltip="Frames the clip shares with the video, to trim when joining them."),
            ],
        )

    @classmethod
    def execute(cls, conditioning, latent, latent_path, context_frames):
        source = load_av_latent(output_path(latent_path))
        source_video, source_audio = av_streams(source)
        conditioning, references = keep_references(conditioning, source)
        target = {key: value for key, value in latent.items() if key != ANCHOR_KEY}
        target.update(references, minimax_video_start_step=0, minimax_audio_start_tick=0)
        video, audio, video_mask, audio_mask, frames = masked_continuation(
            *av_streams(target), source_video, source_audio, context_frames, source["minimax_video_start_step"], source["minimax_audio_start_tick"])
        target["samples"] = comfy.nested_tensor.NestedTensor((video, audio))
        target["noise_mask"] = comfy.nested_tensor.NestedTensor((video_mask, audio_mask))
        return io.NodeOutput(drop_head_keyframes(conditioning, frames), target, frames)


class LumenStitchVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenStitchVideo",
            display_name="Lumen Stitch Video",
            category="Lumen",
            description="Joins a continued clip to the end of its video, without the frames they share: brightness matched at the seam, a short crossfade, and the sound crossfaded over the shared audio.",
            inputs=[
                io.Image.Input("previous_images"),
                io.Audio.Input("previous_audio"),
                io.Image.Input("images", tooltip="The continued clip, with its shared head."),
                io.Audio.Input("audio"),
                io.Int.Input("trim_frames", default=39, min=1, max=192, tooltip="Frames at the start of the clip that the video already has."),
                io.Float.Input("fps", default=24.0, min=1.0, max=120.0),
            ],
            outputs=[io.Image.Output(), io.Audio.Output()],
        )

    @classmethod
    def execute(cls, previous_images, previous_audio, images, audio, trim_frames, fps):
        return io.NodeOutput(stitch_images(previous_images, images, trim_frames),
                             stitch_audio(previous_audio, audio, images.shape[0], trim_frames, fps))


NODES = [LumenSaveVideoLatent, LumenVideoContinuation, LumenStitchVideo]
