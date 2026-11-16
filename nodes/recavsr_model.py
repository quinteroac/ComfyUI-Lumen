"""ReCaVSR's streaming transformer: Wan2.2 TI2V-5B with an LQ projection and recycled latents, one denoising step per
block of frames, a per-layer KV history routed by the checkpoint and a rolling temporal RoPE.

Ported from ReCaVSR (Apache-2.0, Xijun Wang et al., USTC, https://github.com/kopperx/ReCaVSR) onto ComfyUI ops, keeping
the released module names so its weights load as they are.
"""
import torch
import torch.nn.functional as F
from torch import nn

import comfy.ldm.flux.math
import comfy.model_management
from comfy.ldm.modules.attention import AttentionTensorContainer, ComfyAttention, optimized_attention
from comfy.ldm.wan.model import sinusoidal_embedding_1d

try:
    from . import recavsr_triton
except ImportError:  # Without Triton the windowed attention runs on PyTorch, much slower.
    recavsr_triton = None

PREFIX_RGB, BODY_RGB = 21, 8
PREFIX_LATENTS, BODY_LATENTS = 6, 2
# One token per 32x32 pixels: the VAE's 16 and the 2x2 patch.
STRIDE = 32
ROPE_FRAMES = 22
WINDOW = (22, 40)
TIMESTEP = 1000.0
DIM, HEADS, HEAD_DIM = 3072, 24, 128
# Each head's RoPE: 42 dimensions for rows, 42 for columns, and the 44 before them for time.
SPATIAL_DIM = 2 * (HEAD_DIM // 6)
TEMPORAL_DIM = HEAD_DIM - 2 * SPATIAL_DIM

# The released checkpoint's cache routing (static_kv_router in its model_config.json): recent latent frames and periodic
# anchors each layer keeps.
LAYER_ACTIONS = (
    "none", "none", "recent_1", "none", "recent_2", "none", "recent_2", "recent_4", "none", "recent_2_anchor",
    "recent_4", "recent_4_anchor", "recent_2", "recent_4_anchor", "anchor", "recent_4_anchor", "recent_2", "recent_4_anchor",
    "recent_2_anchor", "recent_4", "recent_2", "none", "recent_2_anchor", "recent_2", "none", "recent_2", "none",
    "recent_1", "none", "none",
)
ACTIONS = {"none": (0, False), "recent_1": (1, False), "recent_2": (2, False), "recent_4": (4, False), "anchor": (0, True), "recent_2_anchor": (2, True), "recent_4_anchor": (4, True)}
ANCHOR_START, ANCHOR_STRIDE, ANCHORS = 5, 6, 2


def layer_norm(x, eps=1e-6):
    return F.layer_norm(x.float(), (x.shape[-1],), eps=eps)


def temporal_table(device):
    """cos / sin of the temporal RoPE per position and frequency pair, as the kernel reads them."""
    angles = torch.arange(ROPE_FRAMES, device=device, dtype=torch.float64)[:, None] * (1.0 / 10000.0 ** (torch.arange(0, TEMPORAL_DIM, 2, device=device, dtype=torch.float64) / TEMPORAL_DIM))
    return angles.cos().float().contiguous(), angles.sin().float().contiguous()


def spatial_freqs(height, width, frames, device):
    """RoPE of the token grid on every frame, identity on the temporal dimensions."""
    rows, cols = torch.meshgrid(torch.arange(height, device=device), torch.arange(width, device=device), indexing="ij")
    rope = comfy.ldm.flux.math.rope
    plane = torch.cat((rope(torch.zeros_like(rows.flatten())[None], TEMPORAL_DIM, 10000), rope(rows.flatten()[None], SPATIAL_DIM, 10000), rope(cols.flatten()[None], SPATIAL_DIM, 10000)), dim=-3)
    return plane.repeat(1, frames, 1, 1, 1)[:, None]


def rotate_temporal(x, positions, cos, sin, span):
    """Temporal RoPE of [B, planes * span, heads, dim], one position per plane, for the PyTorch attention."""
    angles = torch.stack((cos[positions], -sin[positions], sin[positions], cos[positions]), dim=-1).view(len(positions), -1, 2, 2)
    identity = torch.eye(2, device=x.device).expand(len(positions), (HEAD_DIM - TEMPORAL_DIM) // 2, 2, 2)
    freqs = torch.cat((angles, identity), dim=1).repeat_interleave(span, dim=0)
    return comfy.ldm.flux.math.apply_rope1(x.transpose(1, 2), freqs[None, None]).transpose(1, 2)


def windowed_attention(q, k, v, planes, height, width, window):
    """Each query sees the window of tokens around it, clamped inside the grid, on every visible plane. q, k, v are
    [B, tokens, heads, dim]; the queries' planes are the last ones of k and v."""
    b, _, heads, dim = q.shape
    span = height * width
    wh, ww = min(height, window[0]), min(width, window[1])
    if wh == height and ww == width:
        q, k, v = (AttentionTensorContainer(t.transpose(1, 2)) for t in (q, k, v))
        return optimized_attention(q, k, v, heads, skip_reshape=True).view(b, -1, heads, dim)
    frames = q.shape[1] // span
    top = (torch.arange(height, device=q.device) - wh // 2).clamp(0, height - wh)
    left = (torch.arange(width, device=q.device) - ww // 2).clamp(0, width - ww)
    columns = torch.arange(width, device=q.device)
    col_mask = (columns[None, :] >= left[:, None]) & (columns[None, :] < left[:, None] + ww)
    q, k, v = q.view(b, frames, height, width, heads, dim), k.view(b, planes, height, width, heads, dim), v.view(b, planes, height, width, heads, dim)
    out = torch.empty_like(q)
    rows = 4
    for y0 in range(0, height, rows):
        y1 = min(height, y0 + rows)
        k0, k1 = int(top[y0]), int(top[y1 - 1]) + wh
        key_rows = torch.arange(k0, k1, device=q.device)
        row_mask = (key_rows[None, :] >= top[y0:y1, None]) & (key_rows[None, :] < top[y0:y1, None] + wh)
        mask = (row_mask[:, None, :, None] & col_mask[None, :, None, :]).reshape((y1 - y0) * width, (k1 - k0) * width)
        mask = mask.repeat(frames, planes)
        tile = F.scaled_dot_product_attention(
            q[:, :, y0:y1].reshape(b, -1, heads, dim).transpose(1, 2),
            k[:, :, k0:k1].reshape(b, -1, heads, dim).transpose(1, 2),
            v[:, :, k0:k1].reshape(b, -1, heads, dim).transpose(1, 2),
            attn_mask=mask,
        )
        out[:, :, y0:y1] = tile.transpose(1, 2).view(b, frames, y1 - y0, width, heads, dim)
    return out.view(b, -1, heads, dim)


class Attention(nn.Module):
    def __init__(self, cross, dtype=None, device=None, operations=None):
        super().__init__()
        self.to_q = operations.Linear(DIM, DIM, dtype=dtype, device=device)
        self.to_k = operations.Linear(DIM, DIM, dtype=dtype, device=device)
        self.to_v = operations.Linear(DIM, DIM, dtype=dtype, device=device)
        self.to_out = nn.ModuleList([operations.Linear(DIM, DIM, dtype=dtype, device=device), nn.Identity()])
        self.norm_q = operations.RMSNorm(DIM, eps=1e-6, dtype=dtype, device=device)
        self.norm_k = operations.RMSNorm(DIM, eps=1e-6, dtype=dtype, device=device)
        if cross:
            self.comfy_attention = ComfyAttention()


class GELU(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.proj = operations.Linear(DIM, 14336, dtype=dtype, device=device)

    def forward(self, x):
        return F.gelu(self.proj(x), approximate="tanh")


class FeedForward(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.net = nn.ModuleList([GELU(dtype=dtype, device=device, operations=operations), nn.Identity(), operations.Linear(14336, DIM, dtype=dtype, device=device)])

    def forward(self, x):
        # In slices of tokens: the hidden layer is 4.7 times as wide as the stream.
        out = torch.empty_like(x)
        for start in range(0, x.shape[1], 16384):
            out[:, start:start + 16384] = self.net[2](self.net[0](x[:, start:start + 16384]))
        return out


class Block(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.attn1 = Attention(False, dtype=dtype, device=device, operations=operations)
        self.attn2 = Attention(True, dtype=dtype, device=device, operations=operations)
        self.norm2 = operations.LayerNorm(DIM, eps=1e-6, elementwise_affine=True, dtype=dtype, device=device)
        self.ffn = FeedForward(dtype=dtype, device=device, operations=operations)
        self.scale_shift_table = nn.Parameter(torch.empty(1, 6, DIM, dtype=dtype, device=device))

    def cross_kv(self, context):
        a = self.attn2
        return a.norm_k(a.to_k(context)), a.to_v(context)

    def forward(self, x, modulation, cross, cache, step):
        shift, scale, gate, c_shift, c_scale, c_gate = modulation.unbind(1)
        a = self.attn1
        norm = torch.addcmul(shift, layer_norm(x), 1 + scale).to(x.dtype)
        q = a.norm_q(a.to_q(norm)).unflatten(2, (HEADS, HEAD_DIM))
        k = a.norm_k(a.to_k(norm)).unflatten(2, (HEADS, HEAD_DIM))
        v = a.to_v(norm).unflatten(2, (HEADS, HEAD_DIM))
        del norm
        apply_rope1 = comfy.ldm.flux.math.apply_rope1
        q = apply_rope1(q.transpose(1, 2), step.freqs).transpose(1, 2)
        k = apply_rope1(k.transpose(1, 2), step.freqs).transpose(1, 2)
        out = self_attention(q, k, v, cache, step)
        cache.commit(k, v, step)
        del q, k, v
        x = torch.addcmul(x.float(), a.to_out[0](out.flatten(2)), gate).to(x.dtype)
        del out
        a = self.attn2
        q = a.norm_q(a.to_q(self.norm2(x.float()).to(x.dtype)))
        k, v = cross
        out = optimized_attention(AttentionTensorContainer(q), AttentionTensorContainer(k), AttentionTensorContainer(v), HEADS, preferred_attention=a.comfy_attention)
        x = x + a.to_out[0](out)
        del q, out
        norm = torch.addcmul(c_shift, layer_norm(x), 1 + c_scale).to(x.dtype)
        return torch.addcmul(x.float(), self.ffn(norm).float(), c_gate).to(x.dtype)


def causal_conv(conv, x, state):
    """A Conv3d of kernel 4 x 3 x 3 that sees no future frame, run on consecutive chunks of a video. state is the number
    of frames seen and the last three of them. Two output frames at a time, each from only the input frames it reads:
    at 4x a whole block's input or output is a few GB."""
    stride = conv.stride[0]
    seen, history = state
    first = (seen + stride - 1) // stride * stride
    frames = ((seen + x.shape[2] - 1) // stride * stride - first) // stride + 1

    def frame(t):
        # Before the video the first frame stands in, as in Wan's causal convolutions.
        t = max(t, 0)
        return x[:, :, t - seen] if t >= seen else history[:, :, t - seen + history.shape[2]]

    out = None
    for i in range(0, frames, 2):
        n = min(2, frames - i)
        end = first + (i + n - 1) * stride
        y = conv(torch.stack([frame(t) for t in range(first + i * stride - 3, end + 1)], dim=2))
        if out is None:
            out = y.new_empty((*y.shape[:2], frames, *y.shape[3:]))
        out[:, :, i:i + n] = y
    return out, (seen + x.shape[2], x[:, :, -3:].clone())


class LQProj(nn.Module):
    """Upscaled LQ RGB to one token per 32x32 pixels and four frames: a 16x16 pixel unshuffle and two causal convolutions."""

    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.conv1 = operations.Conv3d(768, 2048, (4, 3, 3), stride=(2, 1, 1), padding=(0, 1, 1), dtype=dtype, device=device)
        self.norm1 = nn.Module()
        self.norm1.weight = nn.Parameter(torch.empty(2048, 1, 1, 1, dtype=dtype, device=device))
        self.conv2 = operations.Conv3d(2048, 3072, (4, 3, 3), stride=(2, 2, 2), padding=(0, 1, 1), dtype=dtype, device=device)
        self.norm2 = nn.Module()
        self.norm2.weight = nn.Parameter(torch.empty(3072, 1, 1, 1, dtype=dtype, device=device))
        self.out_proj = operations.Linear(3072, DIM, dtype=dtype, device=device)

    @staticmethod
    def channel_norm(x, weight):
        """RMS over the channels in fp32, then SiLU, in place one frame at a time."""
        weight = comfy.model_management.cast_to(weight, torch.float32, x.device)[:, 0]
        for t in range(x.shape[2]):
            frame = x[:, :, t].float()
            x[:, :, t] = F.silu((frame * torch.rsqrt(frame.square().mean(dim=1, keepdim=True) + 1e-6) * weight).to(x.dtype))
        return x

    def stream(self, video, state):
        b, c, t, h, w = video.shape
        x = video.view(b, c, t, h // 16, 16, w // 16, 16).permute(0, 1, 4, 6, 2, 3, 5).reshape(b, c * 256, t, h // 16, w // 16)
        x, s1 = causal_conv(self.conv1, x, state[0])
        x = self.channel_norm(x, self.norm1.weight)
        x, s2 = causal_conv(self.conv2, x, state[1])
        x = self.channel_norm(x, self.norm2.weight)
        return self.out_proj(x.flatten(2).transpose(1, 2)), (s1, s2)


class TextProjection(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.linear_1 = operations.Linear(4096, DIM, dtype=dtype, device=device)
        self.linear_2 = operations.Linear(DIM, DIM, dtype=dtype, device=device)


class TimeEmbedding(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.linear_1 = operations.Linear(256, DIM, dtype=dtype, device=device)
        self.linear_2 = operations.Linear(DIM, DIM, dtype=dtype, device=device)


class ConditionEmbedder(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.time_embedder = TimeEmbedding(dtype=dtype, device=device, operations=operations)
        self.time_proj = operations.Linear(DIM, 6 * DIM, dtype=dtype, device=device)
        self.text_embedder = TextProjection(dtype=dtype, device=device, operations=operations)


class ReCaVSR(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.dtype = dtype
        self.patch_embedding = operations.Conv3d(48, DIM, (1, 2, 2), stride=(1, 2, 2), dtype=dtype, device=device)
        self.condition_embedder = ConditionEmbedder(dtype=dtype, device=device, operations=operations)
        self.blocks = nn.ModuleList([Block(dtype=dtype, device=device, operations=operations) for _ in LAYER_ACTIONS])
        self.proj_out = operations.Linear(DIM, 48 * 4, dtype=dtype, device=device)
        self.scale_shift_table = nn.Parameter(torch.empty(1, 2, DIM, dtype=dtype, device=device))
        self.lq_proj = LQProj(dtype=dtype, device=device, operations=operations)
        self.sr_proj = operations.Linear(DIM, DIM, dtype=dtype, device=device)

    def conditioning(self, prompt, device):
        """The fixed timestep and prompt of every block: each layer's modulation and cross-attention keys and values."""
        e = self.condition_embedder
        t = sinusoidal_embedding_1d(256, torch.tensor([TIMESTEP], device=device)).to(self.dtype)
        temb = e.time_embedder.linear_2(F.silu(e.time_embedder.linear_1(t)))
        projection = e.time_proj(F.silu(temb)).view(1, 6, DIM).float()
        context = e.text_embedder.linear_2(F.gelu(e.text_embedder.linear_1(prompt), approximate="tanh"))
        modulations = [(comfy.model_management.cast_to(b.scale_shift_table, torch.float32, device) + projection)[:, :, None] for b in self.blocks]
        cross = [b.cross_kv(context) for b in self.blocks]
        head = (comfy.model_management.cast_to(self.scale_shift_table, temb.dtype, device) + temb[:, None]).float()[:, :, None]
        return modulations, cross, head


class LayerCache:
    """One layer's KV history: the latent frames its action keeps, in fixed slots of one buffer. Keys are kept before
    their temporal RoPE, so they move with the rolling origin. The buffers live on storage: the GPU, or pinned RAM when
    the history doesn't fit beside the activations, uploaded for each use."""

    def __init__(self, action, storage):
        self.storage = storage
        self.recent, self.anchor = ACTIONS[action]
        self.capacity = self.recent + (ANCHORS if self.anchor else 0)
        self.key = self.value = None
        self.slots = {}

    def keep(self, frames):
        keep = set(frames[-self.recent:]) if self.recent else set()
        if self.anchor:
            keep.update([i for i in frames if i >= ANCHOR_START and (i - ANCHOR_START) % ANCHOR_STRIDE == 0][-ANCHORS:])
        return [i for i in frames if i in keep]

    def commit(self, k, v, step):
        """Copies the planes of this block the layer keeps into free slots."""
        if not self.capacity:
            return
        span = step.height * step.width
        kept = self.keep(sorted(self.slots) + list(range(step.start, step.start + step.frames)))
        if self.key is None:
            pin = self.storage.type == "cpu"
            self.key = torch.empty((k.shape[0], self.capacity * span, HEADS, HEAD_DIM), dtype=k.dtype, device=self.storage, pin_memory=pin)
            self.value = torch.empty((v.shape[0], self.capacity * span, HEADS, HEAD_DIM), dtype=v.dtype, device=self.storage, pin_memory=pin)
        self.slots = {i: s for i, s in self.slots.items() if i in kept}
        free = iter(sorted(set(range(self.capacity)) - set(self.slots.values())))
        for i in kept:
            if i not in self.slots:
                slot, plane = next(free), i - step.start
                self.key[:, slot * span:(slot + 1) * span].copy_(k[:, plane * span:(plane + 1) * span], non_blocking=True)
                self.value[:, slot * span:(slot + 1) * span].copy_(v[:, plane * span:(plane + 1) * span], non_blocking=True)
                self.slots[i] = slot


def self_attention(q, k, v, cache, step):
    """Spatial-window attention over the block's own planes and the history the layer keeps, with the temporal RoPE
    relative to the rolling origin."""
    span = step.height * step.width
    frames = sorted(cache.slots)
    slots = [cache.slots[i] for i in frames]
    past = [i - step.origin for i in frames]
    if recavsr_triton is not None and q.is_cuda:
        device = q.device
        if frames:
            pk, pv = cache.key.to(device, non_blocking=True), cache.value.to(device, non_blocking=True)
            slots += [-1] * (cache.capacity - len(frames))
            past += [0] * (cache.capacity - len(frames))
        else:
            pk = pv = q.new_empty((q.shape[0], 0, HEADS, HEAD_DIM))
        return recavsr_triton.paired_attention(
            q, k, v, pk, pv, torch.tensor(slots, dtype=torch.int32, device=device), torch.tensor(past, dtype=torch.int32, device=device),
            torch.tensor(step.positions, dtype=torch.int32, device=device), step.cos, step.sin, step.height, step.width, *WINDOW,
        )
    keys = torch.cat([cache.key[:, s * span:(s + 1) * span].to(k.device) for s in slots] + [k], dim=1)
    values = torch.cat([cache.value[:, s * span:(s + 1) * span].to(v.device) for s in slots] + [v], dim=1)
    q = rotate_temporal(q, step.positions, step.cos, step.sin, span)
    keys = rotate_temporal(keys, past + step.positions, step.cos, step.sin, span)
    return windowed_attention(q, keys, values, len(slots) + step.frames, step.height, step.width, WINDOW)


class Step:
    """Where one block stands: its latent frames, the rolling RoPE origin and the token grid."""

    def __init__(self, start, frames, height, width, cos, sin, freqs):
        self.start, self.frames, self.height, self.width = start, frames, height, width
        # The temporal RoPE covers the 22 latent frames the model was trained on, ending at this block.
        self.origin = max(0, start + frames - ROPE_FRAMES)
        self.positions = list(range(start - self.origin, start - self.origin + frames))
        self.cos, self.sin, self.freqs = cos, sin, freqs


class Session:
    """One video at one size: the LQ convolutions' history, each layer's KV history and the recycled latents.
    step() takes the blocks in order: 21 frames, then 8 at a time."""

    def __init__(self, model, prompt, height, width, seed, device, history_device):
        self.model, self.device = model, device
        self.height, self.width = height // STRIDE, width // STRIDE
        self.modulations, self.cross, self.head = model.conditioning(prompt.to(device, model.dtype), device)
        self.cos, self.sin = temporal_table(device)
        self.freqs = {}
        self.caches = [LayerCache(action, history_device) for action in LAYER_ACTIONS]
        self.lq_state = ((0, None), (0, None))
        self.generator = torch.Generator(device=device).manual_seed(seed)
        self.start = 0
        self.previous = None

    def step(self, lq):
        """[1, 3, 21 or 8, H, W] LQ in [-1, 1] at the output size → the block's [1, 48, 6 or 2, H/16, W/16] latents."""
        m = self.model
        frames = PREFIX_LATENTS if self.start == 0 else BODY_LATENTS
        if frames not in self.freqs:
            self.freqs[frames] = spatial_freqs(self.height, self.width, frames, self.device)
        step = Step(self.start, frames, self.height, self.width, self.cos, self.sin, self.freqs[frames])
        noise = torch.randn((1, 48, frames, self.height * 2, self.width * 2), generator=self.generator, device=self.device, dtype=torch.float32)
        recycle = torch.zeros_like(noise, dtype=m.dtype) if self.previous is None else self.previous
        x = m.patch_embedding(noise.to(m.dtype)).flatten(2).transpose(1, 2)
        lq, self.lq_state = m.lq_proj.stream(lq.to(m.dtype), self.lq_state)
        x = x + lq
        x = x + m.sr_proj(m.patch_embedding(recycle).flatten(2).transpose(1, 2))
        del lq
        for block, cache, modulation, cross in zip(m.blocks, self.caches, self.modulations, self.cross):
            x = block(x, modulation, cross, cache, step)
        shift, scale = self.head.unbind(1)
        x = m.proj_out(torch.addcmul(shift, layer_norm(x), 1 + scale).to(m.dtype))
        prediction = x.view(1, frames, self.height, self.width, 1, 2, 2, 48).permute(0, 7, 1, 4, 2, 5, 3, 6).reshape(noise.shape)
        result = noise - prediction.float()
        self.previous = result[:, :, -BODY_LATENTS:].to(m.dtype).clone()
        self.start += frames
        return result
