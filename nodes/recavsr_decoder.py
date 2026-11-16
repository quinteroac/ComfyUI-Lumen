"""ReCaVSR's FlashDecoder: a small streaming transformer that turns each Wan2.2 latent frame into RGB, conditioned on the
upscaled LQ frames. The first latent gives one frame, each later one four.

Ported from ReCaVSR (Apache-2.0, Xijun Wang et al., USTC, https://github.com/kopperx/ReCaVSR) onto ComfyUI ops, keeping
the released module names. Linear layers run in bf16 and norms in fp32, as the reference does under autocast.
"""
import torch
import torch.nn.functional as F
from torch import nn

import comfy.latent_formats
import comfy.ldm.flux.math

try:
    from . import recavsr_triton
except ImportError:  # Without Triton the local attention runs on PyTorch, much slower.
    recavsr_triton = None

DIM, HEADS, KV_HEADS, HEAD_DIM = 512, 8, 2, 64
WINDOW = (24, 24)
COMPUTE = torch.bfloat16


def local_attention(q, k, v, height, width, group_size, temporal_window):
    """Each query sees a 24 x 24 neighbourhood, cut at the borders, on every cached and current plane (the cache only
    keeps the planes in the temporal window). q [B, 8, tokens, 64], k and v [B, 2, tokens, 64]."""
    if recavsr_triton is not None and q.is_cuda:
        return recavsr_triton.local_attention(q, k, v, height, width, WINDOW, group_size, temporal_window)
    b, _, tokens, dim = q.shape
    frames, planes = tokens // (height * width), k.shape[2] // (height * width)
    wh, ww = WINDOW
    columns = torch.arange(width, device=q.device)
    col_mask = (columns[None, :] >= columns[:, None] - ww // 2) & (columns[None, :] < columns[:, None] + ww // 2)
    q = q.view(b, HEADS, frames, height, width, dim)
    k, v = k.view(b, KV_HEADS, planes, height, width, dim), v.view(b, KV_HEADS, planes, height, width, dim)
    out = torch.empty_like(q)
    rows = 4
    for y0 in range(0, height, rows):
        y1 = min(height, y0 + rows)
        k0, k1 = max(0, y0 - wh // 2), min(height, y1 - 1 + wh // 2)
        query_rows, key_rows = torch.arange(y0, y1, device=q.device), torch.arange(k0, k1, device=q.device)
        row_mask = (key_rows[None, :] >= query_rows[:, None] - wh // 2) & (key_rows[None, :] < query_rows[:, None] + wh // 2)
        mask = (row_mask[:, None, :, None] & col_mask[None, :, None, :]).reshape((y1 - y0) * width, (k1 - k0) * width).repeat(frames, planes)
        tile = F.scaled_dot_product_attention(
            q[:, :, :, y0:y1].reshape(b, HEADS, -1, dim), k[:, :, :, k0:k1].reshape(b, KV_HEADS, -1, dim), v[:, :, :, k0:k1].reshape(b, KV_HEADS, -1, dim),
            attn_mask=mask, enable_gqa=True,
        )
        out[:, :, :, y0:y1] = tile.view(b, HEADS, frames, y1 - y0, width, dim)
    return out.view(b, HEADS, tokens, dim)


def rope_freqs(start, frames, height, width, device):
    """3D RoPE of the head: 16 dimensions for time, 24 for rows and 24 for columns."""
    t, y, x = torch.meshgrid(torch.arange(start, start + frames, device=device), torch.arange(height, device=device), torch.arange(width, device=device), indexing="ij")
    rope = comfy.ldm.flux.math.rope
    return torch.cat((rope(t.flatten()[None], 16, 10000), rope(y.flatten()[None], 24, 10000), rope(x.flatten()[None], 24, 10000)), dim=-3)[:, None]


class Attention(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.query = operations.Linear(DIM, DIM, dtype=dtype, device=device)
        self.key = operations.Linear(DIM, KV_HEADS * HEAD_DIM, dtype=dtype, device=device)
        self.value = operations.Linear(DIM, KV_HEADS * HEAD_DIM, dtype=dtype, device=device)
        self.key_norm = operations.RMSNorm(HEAD_DIM, eps=1e-5, dtype=dtype, device=device)
        self.value_norm = operations.RMSNorm(HEAD_DIM, eps=1e-5, dtype=dtype, device=device)
        self.output = operations.Linear(DIM, DIM, dtype=dtype, device=device)

    def forward(self, x, cache, query_freqs, key_freqs, grid, group_size, temporal_window):
        b, tokens, _ = x.shape
        q = self.query(x).view(b, tokens, HEADS, HEAD_DIM).transpose(1, 2)
        k = self.key_norm(self.key(x).view(b, tokens, KV_HEADS, HEAD_DIM).transpose(1, 2).float())
        v = self.value_norm(self.value(x).view(b, tokens, KV_HEADS, HEAD_DIM).transpose(1, 2).float())
        if cache is not None:
            k, v = torch.cat((cache[0], k), dim=2), torch.cat((cache[1], v), dim=2)
        apply_rope1 = comfy.ldm.flux.math.apply_rope1
        out = local_attention(apply_rope1(q, query_freqs), apply_rope1(k, key_freqs).to(COMPUTE), v.to(COMPUTE), *grid, group_size, temporal_window)
        return self.output(out.transpose(1, 2).reshape(b, tokens, DIM)), (k, v)


class SwiGLU(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.gate = operations.Linear(DIM, 4 * DIM, dtype=dtype, device=device)
        self.up = operations.Linear(DIM, 4 * DIM, dtype=dtype, device=device)
        self.down = operations.Linear(4 * DIM, DIM, dtype=dtype, device=device)

    def forward(self, x):
        return self.down(F.silu(self.gate(x)) * self.up(x))


class Block(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.attention_norm = operations.RMSNorm(DIM, eps=1e-5, dtype=dtype, device=device)
        self.attention = Attention(dtype=dtype, device=device, operations=operations)
        self.feed_forward_norm = operations.RMSNorm(DIM, eps=1e-5, dtype=dtype, device=device)
        self.feed_forward = SwiGLU(dtype=dtype, device=device, operations=operations)

    def forward(self, x, cache, *args):
        out, cache = self.attention(self.attention_norm(x.float()).to(COMPUTE), cache, *args)
        x = x + out
        return x + self.feed_forward(self.feed_forward_norm(x.float()).to(COMPUTE)), cache


class Stack(nn.Module):
    """Blocks whose keys and values are kept for the last max_frames frames."""

    def __init__(self, depth, max_frames, dtype=None, device=None, operations=None):
        super().__init__()
        self.max_frames = max_frames
        self.blocks = nn.ModuleList([Block(dtype=dtype, device=device, operations=operations) for _ in range(depth)])

    def forward(self, x, caches, frames, height, width):
        span = height * width
        keep = (self.max_frames - frames) * span
        caches = [None if c is None else (c[0][:, :, -keep:], c[1][:, :, -keep:]) for c in caches]
        previous = 0 if caches[0] is None else caches[0][0].shape[2] // span
        query_freqs = rope_freqs(previous, frames, height, width, x.device)
        key_freqs = rope_freqs(0, previous + frames, height, width, x.device)
        out = []
        for block, cache in zip(self.blocks, caches):
            x, cache = block(x, cache, query_freqs, key_freqs, (height, width), frames, self.max_frames // frames)
            out.append(cache)
        return x, out


class FlashDecoder(nn.Module):
    def __init__(self, dtype=None, device=None, operations=None):
        super().__init__()
        self.latent_projection = operations.Linear(48, DIM, dtype=dtype, device=device)
        self.backbone = Stack(12, 2, dtype=dtype, device=device, operations=operations)
        self.temporal_projection = operations.Linear(DIM, 4 * DIM, dtype=dtype, device=device)
        self.temporal_refinement = Stack(2, 8, dtype=dtype, device=device, operations=operations)
        self.spatial_projection = nn.Sequential(operations.Linear(DIM, 4 * DIM, dtype=dtype, device=device), nn.SiLU(), operations.Linear(4 * DIM, 3 * 16 * 16, dtype=dtype, device=device))
        self.lr_stem = operations.Linear(3 * 16 * 16, 48, dtype=dtype, device=device)
        self.lr_early_projection = operations.Linear(4 * 48, DIM, bias=False, dtype=dtype, device=device)
        self.lr_late_projection = operations.Linear(48, DIM, bias=False, dtype=dtype, device=device)

    def encode_lr(self, lr, first):
        """The LQ frames as one token per 16x16 pixels: grouped by four for the backbone, one per frame for the refinement."""
        b, _, frames, height, width = lr.shape
        packed = F.pixel_unshuffle(lr.transpose(1, 2).reshape(b * frames, 3, height, width), 16).permute(0, 2, 3, 1)
        h, w = height // 16, width // 16
        features = self.lr_stem(packed.to(COMPUTE)).reshape(b, frames, h, w, 48)
        if first:
            features = torch.cat((features[:, :1].expand(-1, 3, -1, -1, -1), features), dim=1)
        grouped = features.reshape(b, -1, 4, h, w, 48).permute(0, 1, 3, 4, 2, 5).reshape(b, -1, 192)
        return self.lr_early_projection(grouped), self.lr_late_projection(features.reshape(b, -1, 48))

    def decode_step(self, latent, lr, state):
        """One latent frame [B, 48, h, w] and its LQ frames → RGB [B, 3, 1 or 4, H, W] in about [-1, 1]."""
        b, _, h, w = latent.shape
        first = state[0][0] is None
        early, late = self.encode_lr(lr, first)
        x = self.latent_projection(latent.permute(0, 2, 3, 1)).reshape(b, h * w, DIM) + early
        x, backbone = self.backbone(x, state[0], 1, h, w)
        x = self.temporal_projection(x).view(b, h, w, 4, DIM).permute(0, 3, 1, 2, 4).reshape(b, 4 * h * w, DIM) + late
        x, refinement = self.temporal_refinement(x, state[1], 4, h, w)
        pixels = self.spatial_projection(x).view(b, 4, h, w, 768).permute(0, 1, 4, 2, 3).reshape(b * 4, 768, h, w)
        pixels = F.pixel_shuffle(pixels, 16).view(b, 4, 3, h * 16, w * 16).permute(0, 2, 1, 3, 4)
        return (pixels[:, :, 3:] if first else pixels), (backbone, refinement)


class DecoderSession:
    """One video's decoder history; step() takes each block's latents with the block's LQ frames."""

    def __init__(self, decoder, device):
        self.decoder = decoder
        latent_format = comfy.latent_formats.Wan22()
        self.mean = latent_format.latents_mean.to(device, COMPUTE)
        self.std = latent_format.latents_std.to(device, COMPUTE)
        self.state = ([None] * 12, [None] * 2)

    def step(self, latents, lq):
        """Yields [1, 3, frames, H, W] RGB chunks in [-1, 1]."""
        offset = 0
        for i in range(latents.shape[2]):
            take = 1 if self.state[0][0] is None else 4
            raw = latents[:, :, i].to(COMPUTE) * self.std[:, :, 0] + self.mean[:, :, 0]
            rgb, self.state = self.decoder.decode_step(raw, lq[:, :, offset:offset + take], self.state)
            offset += take
            yield rgb.clamp(-1, 1)
