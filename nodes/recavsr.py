"""ReCaVSR video super-resolution: a one-step streaming upscaler built on Wan2.2 TI2V-5B, trained for 4x.

Ported from ReCaVSR (Apache-2.0, Xijun Wang et al., USTC, https://github.com/kopperx/ReCaVSR); the model is in
recavsr_model.py and recavsr_decoder.py. The video is upscaled 21 frames and then 8 at a time, and each block is
encoded into the output as soon as it is decoded, so the upscaled frames never sit in memory.
"""
import logging
import math
import os
import uuid

import av
import torch
import torch.nn.functional as F

import comfy.model_management
import comfy.model_patcher
import comfy.ops
import comfy.utils
import folder_paths
from comfy_api.latest import InputImpl, io

from .recavsr_decoder import DecoderSession, FlashDecoder
from .recavsr_model import BODY_RGB, DIM, LAYER_ACTIONS, PREFIX_RGB, STRIDE, LayerCache, ReCaVSR, Session

RECAVSR = io.Custom("RECAVSR")


class ReCaVSRModels:
    def __init__(self, transformer, decoder, prompt):
        self.transformer, self.decoder, self.prompt = transformer, decoder, prompt


def load_patcher(model, sd, path):
    device = comfy.model_management.get_torch_device()
    comfy.model_management.archive_model_dtypes(model)
    # The classic patcher: load_models_gpu then keeps the activations' memory free and streams the weights that don't
    # fit. ReCaVSR's activations at 4x are several GB, more than dynamic VRAM's on-demand loading leaves room for.
    patcher = comfy.model_patcher.ModelPatcher(model, load_device=device, offload_device=comfy.model_management.unet_offload_device())
    missing, unexpected = model.load_state_dict(sd, strict=False)
    missing = [k for k in missing if not k.endswith("comfy_attention.config")]
    if missing or unexpected:
        raise ValueError(f"{os.path.basename(path)} is not a ReCaVSR file: missing {missing[:4]}, unexpected {unexpected[:4]}.")
    return patcher


def adain(content, reference):
    """Each frame's per-channel mean and variance matched to the reference; [N, 3, H, W] in [0, 1]."""
    content_var, content_mean = torch.var_mean(content, dim=(-2, -1), keepdim=True)
    reference_var, reference_mean = torch.var_mean(reference, dim=(-2, -1), keepdim=True)
    return (content - content_mean) * ((reference_var + 1e-5) / (content_var + 1e-5)).sqrt() + reference_mean


def wavelet(content, reference):
    """The reference's low frequencies under the content's detail (StableSR's wavelet color fix); [N, 3, H, W]."""
    taps = content.new_tensor([1.0, 2.0, 1.0])
    kernel = (torch.outer(taps, taps) / 16).expand(3, 1, 3, 3).contiguous()
    high = torch.zeros_like(content)
    for radius in (1, 2, 4, 8, 16):
        low = F.conv2d(F.pad(content, (radius,) * 4, mode="replicate"), kernel, dilation=radius, groups=3)
        high.add_(content - low)
        content = low
        reference = F.conv2d(F.pad(reference, (radius,) * 4, mode="replicate"), kernel, dilation=radius, groups=3)
    return high + reference


def upscaled_lq(frames, block, height, width, padded_height, padded_width, device):
    """Frames [T, h, w, 3] in [0, 1] → [1, 3, block, H, W] in [-1, 1], bf16 as both models read it: resized bilinear and
    rounded to 8 bits like the reference's OpenCV resize, the last frame repeated to fill the block, padded to whole
    tokens. One frame at a time, so a 4x block never exists in fp32."""
    out = torch.empty((1, 3, block, padded_height, padded_width), device=device, dtype=torch.bfloat16)
    for i in range(block):
        x = frames[min(i, len(frames) - 1)].to(device).movedim(-1, 0)[None] * 255
        x = F.interpolate(x, size=(height, width), mode="bilinear", align_corners=False).round_().clamp_(0, 255) / 127.5 - 1
        if padded_width > width:
            x = F.pad(x, (0, padded_width - width, 0, 0), mode="reflect" if padded_width - width < width else "replicate")
        if padded_height > height:
            x = F.pad(x, (0, 0, 0, padded_height - height), mode="reflect" if padded_height - height < height else "replicate")
        out[0, :, i] = x[0]
    return out


def memory_required(height, width):
    """VRAM beside the weights: the layers' KV history, and the rest of the activations (the transformer's 6-frame
    first block, its LQ convolutions or the decoder, whichever is running), measured at about 1 MB per token of a
    frame (6.2 GB at 1952x3320)."""
    tokens = (height // STRIDE) * (width // STRIDE)
    history = sum(LayerCache(action, None).capacity for action in LAYER_ACTIONS) * tokens * DIM * 2 * 2
    return history, tokens * 1100 * 1024


class VideoWriter:
    """H.264 into an mp4, frame by frame, with the input's audio (both streams exist before the first frame is written)."""

    def __init__(self, path, width, height, rate, audio):
        self.container = av.open(path, mode="w")
        self.stream = self.container.add_stream("libx264", rate=rate)
        self.stream.width, self.stream.height = width, height
        # 4:2:0 needs even sides; odd ones keep every pixel in 4:4:4.
        self.stream.pix_fmt = "yuv420p" if width % 2 == 0 and height % 2 == 0 else "yuv444p"
        self.stream.options = {"crf": "16", "preset": "fast"}
        self.audio = audio
        if audio is not None:
            self.layout = {1: "mono", 2: "stereo", 6: "5.1"}.get(audio["waveform"].shape[1], "stereo")
            self.audio_stream = self.container.add_stream("aac", rate=int(audio["sample_rate"]), layout=self.layout)
        self.rate = rate
        self.frames = 0

    def write(self, rgb):
        """rgb [T, H, W, 3] uint8 on the CPU."""
        for array in rgb.numpy():
            self.container.mux(self.stream.encode(av.VideoFrame.from_ndarray(array, format="rgb24")))
        self.frames += rgb.shape[0]

    def close(self):
        self.container.mux(self.stream.encode(None))
        if self.audio is not None:
            sample_rate = int(self.audio["sample_rate"])
            waveform = self.audio["waveform"][0, :, :math.ceil(sample_rate * self.frames / self.rate)]
            frame = av.AudioFrame.from_ndarray(waveform.float().contiguous().numpy(), format="fltp", layout=self.layout)
            frame.sample_rate, frame.pts = sample_rate, 0
            self.container.mux(self.audio_stream.encode(frame))
            self.container.mux(self.audio_stream.encode(None))
        self.container.close()


class LumenReCaVSRLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenReCaVSRLoader",
            display_name="Lumen ReCaVSR Loader",
            category="Lumen",
            description="Loads ReCaVSR, a one-step streaming video upscaler built on Wan2.2 TI2V-5B.",
            inputs=[
                io.Combo.Input("transformer", options=folder_paths.get_filename_list("diffusion_models"), tooltip="ReCaVSR's transformer.safetensors, or its int8 ConvRot conversion."),
                io.Combo.Input("prompt_embedding", options=folder_paths.get_filename_list("diffusion_models"), tooltip="ReCaVSR's prompt.safetensors, its fixed prompt embedding."),
                io.Combo.Input("decoder", options=folder_paths.get_filename_list("vae"), tooltip="ReCaVSR's flashdecoder.safetensors."),
            ],
            outputs=[RECAVSR.Output(display_name="recavsr")],
        )

    @classmethod
    def execute(cls, transformer, prompt_embedding, decoder):
        dtype = torch.bfloat16
        transformer = folder_paths.get_full_path_or_raise("diffusion_models", transformer)
        decoder = folder_paths.get_full_path_or_raise("vae", decoder)
        sd = comfy.utils.load_torch_file(transformer, safe_load=True)
        # manual_cast: the fp32 LayerNorm and the fp32 FlashDecoder weights are cast to what each layer is given; an int8
        # ConvRot file (tools/recavsr_int8.py) carries its layers' format and runs on comfy-kitchen's int8 matmul.
        quant = comfy.utils.detect_layer_quantization(sd, "")
        device = comfy.model_management.get_torch_device()
        ops = comfy.ops.mixed_precision_ops(quant, dtype, disabled=comfy.ops.get_disabled_quant_formats(device)) if quant else comfy.ops.manual_cast
        dit = ReCaVSR(dtype=dtype, operations=ops)
        flash = FlashDecoder(dtype=torch.float32, operations=comfy.ops.manual_cast)
        prompt = comfy.utils.load_torch_file(folder_paths.get_full_path_or_raise("diffusion_models", prompt_embedding), safe_load=True)["positive"]
        return io.NodeOutput(ReCaVSRModels(
            load_patcher(dit, sd, transformer),
            load_patcher(flash, comfy.utils.load_torch_file(decoder, safe_load=True), decoder),
            prompt,
        ))


class LumenReCaVSRUpscale(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LumenReCaVSRUpscale",
            display_name="Lumen ReCaVSR Upscale Video",
            category="Lumen",
            description="Upscales a video with ReCaVSR in one step per block of frames, keeping its frame rate and audio. "
            "Scale 4 is what the model was trained for.",
            inputs=[
                RECAVSR.Input("recavsr"),
                io.Video.Input("video"),
                io.Float.Input("scale", default=4.0, min=0.25, max=16.0, step=0.25),
                io.Int.Input("seed", default=42, min=0, max=0xffffffffffffffff, control_after_generate=True),
                io.Combo.Input("color_fix", options=["none", "adain", "wavelet"], tooltip="adain matches each frame's colour statistics to the input; wavelet keeps the input's low frequencies under the new detail."),
            ],
            outputs=[io.Video.Output()],
        )

    @classmethod
    def execute(cls, recavsr, video, scale, seed, color_fix):
        components = video.get_components()
        frames = components.images[..., :3]
        total, in_height, in_width = frames.shape[:3]
        # Each side rounded half up, as the reference does.
        height, width = math.floor(in_height * scale + 0.5), math.floor(in_width * scale + 0.5)
        padded_height, padded_width = height + (-height) % STRIDE, width + (-width) % STRIDE
        device = comfy.model_management.get_torch_device()
        history, work = memory_required(padded_height, padded_width)
        comfy.model_management.load_models_gpu([recavsr.transformer, recavsr.decoder], memory_required=history + work)
        history_device = device
        if comfy.model_management.get_free_memory(device) < history + work:
            history_device = torch.device("cpu")
            logging.info("ReCaVSR: the attention history of a %dx%d video doesn't fit in VRAM, keeping it in RAM.", width, height)
        session = Session(recavsr.transformer.model, recavsr.prompt, padded_height, padded_width, seed, device, history_device)
        decoder = DecoderSession(recavsr.decoder.model, device)
        path = os.path.join(folder_paths.get_temp_directory(), f"lumen_recavsr_{uuid.uuid4().hex}.mp4")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        writer = VideoWriter(path, width, height, components.frame_rate, components.audio)
        progress = comfy.utils.ProgressBar(total)
        try:
            start = 0
            while start < total:
                block = PREFIX_RGB if start == 0 else BODY_RGB
                valid = min(block, total - start)
                lq = upscaled_lq(frames[start:start + valid], block, height, width, padded_height, padded_width, device)
                offset = 0
                for rgb in decoder.step(session.step(lq), lq):
                    take = min(valid - offset, rgb.shape[2])
                    if take <= 0:
                        break
                    rgb = rgb[0, :, :take, :height, :width].movedim(0, 1).float().add(1).mul(0.5)
                    if color_fix == "adain":
                        rgb = adain(rgb, lq[0, :, offset:offset + take, :height, :width].movedim(0, 1).float().add(1).mul(0.5))
                    elif color_fix == "wavelet":
                        reference = F.interpolate(frames[start + offset:start + offset + take].to(device).movedim(-1, 1), size=(height, width), mode="bicubic", align_corners=False).clamp(0, 1)
                        rgb = wavelet(rgb.clamp(0, 1), reference)
                    writer.write(rgb.clamp(0, 1).mul(255).round().to(torch.uint8).movedim(1, -1).cpu())
                    offset += take
                start += valid
                progress.update(valid)
                comfy.model_management.throw_exception_if_processing_interrupted()
        except BaseException:
            writer.container.close()
            if os.path.exists(path):
                os.remove(path)
            raise
        writer.close()
        return io.NodeOutput(InputImpl.VideoFromFile(path))


NODES = [LumenReCaVSRLoader, LumenReCaVSRUpscale]
