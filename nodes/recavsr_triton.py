"""Triton kernels of ReCaVSR's windowed attention, forward only.

From ReCaVSR (Apache-2.0, Xijun Wang et al., USTC, https://github.com/kopperx/ReCaVSR): `_paired_local` is
recavsr_infer/kernels/local_attention.py and `_forward` is recavsr_infer/models/flashdecoder/_local_attention_triton.py,
both unchanged; the launchers below follow theirs without the autograd and torch.library wrappers.
"""
import torch
import triton
import triton.language as tl

@triton.jit
def _paired_local(
    Q,
    CK,
    CV,
    PK,
    PV,
    SLOTS,
    PPOS,
    QPOS,
    COS,
    SIN,
    OUT,
    qs0: tl.constexpr,
    qs1: tl.constexpr,
    qs2: tl.constexpr,
    cs0: tl.constexpr,
    cs1: tl.constexpr,
    cs2: tl.constexpr,
    vs0: tl.constexpr,
    vs1: tl.constexpr,
    vs2: tl.constexpr,
    ps0: tl.constexpr,
    ps1: tl.constexpr,
    ps2: tl.constexpr,
    pv0: tl.constexpr,
    pv1: tl.constexpr,
    pv2: tl.constexpr,
    HEIGHT: tl.constexpr,
    WIDTH: tl.constexpr,
    QT: tl.constexpr,
    CAP: tl.constexpr,
    HEADS: tl.constexpr,
    DIM: tl.constexpr,
    TD: tl.constexpr,
    WH: tl.constexpr,
    WW: tl.constexpr,
    BH: tl.constexpr,
    BW: tl.constexpr,
    BT: tl.constexpr,
    BM: tl.constexpr,
    BN: tl.constexpr,
    ROWS: tl.constexpr,
    COLS: tl.constexpr,
):
    spatial_tile, temporal_tile, bh = (
        tl.program_id(0),
        tl.program_id(1),
        tl.program_id(2),
    )
    batch, head = bh // HEADS, bh % HEADS
    y0 = spatial_tile // triton.cdiv(WIDTH, BW) * BH
    x0 = spatial_tile % triton.cdiv(WIDTH, BW) * BW
    r = tl.arange(0, BM)
    qt = temporal_tile * BT + r // (BH * BW)
    qy = y0 + r // BW % BH
    qx = x0 + r % BW
    good_q = (qt < QT) & (qy < HEIGHT) & (qx < WIDTH)
    qi = qt * (HEIGHT * WIDTH) + qy * WIDTH + qx
    d = tl.arange(0, DIM)
    q = tl.load(
        Q + batch * qs0 + qi[:, None] * qs1 + head * qs2 + d[None, :],
        good_q[:, None],
        0,
    ).to(tl.float32)
    # Swap rotary partners in registers instead of loading Q a second time.
    qp = tl.gather(q, tl.broadcast_to((d ^ 1)[None, :], (BM, DIM)), axis=1)
    pos = tl.load(QPOS + qt, good_q, 0)
    tc = tl.load(
        COS + pos[:, None] * (TD // 2) + d[None, :] // 2,
        good_q[:, None] & (d[None, :] < TD),
        1,
    )
    ts = tl.load(
        SIN + pos[:, None] * (TD // 2) + d[None, :] // 2,
        good_q[:, None] & (d[None, :] < TD),
        0,
    )
    sign = tl.where(d % 2 == 0, -1.0, 1.0)
    q = (q * tc + qp * ts * sign[None, :]).to(Q.dtype.element_ty)
    top = tl.minimum(tl.maximum(qy - WH // 2, 0), HEIGHT - WH)
    left = tl.minimum(tl.maximum(qx - WW // 2, 0), WIDTH - WW)
    base_y = tl.minimum(tl.maximum(y0 - WH // 2, 0), HEIGHT - WH)
    base_x = tl.minimum(tl.maximum(x0 - WW // 2, 0), WIDTH - WW)
    maximum = tl.full((BM,), -float("inf"), tl.float32)
    denominator = tl.full((BM,), 0, tl.float32)
    acc = tl.full((BM, DIM), 0, tl.float32)
    for plane in range(CAP + QT):
        if plane < CAP:
            slot = tl.load(SLOTS + plane)
            tpos = tl.load(PPOS + plane)
            kp, vp = PK, PV
            k0, k1, k2 = ps0, ps1, ps2
            v0, v1, v2 = pv0, pv1, pv2
        else:
            slot = plane - CAP
            tpos = tl.load(QPOS + slot)
            kp, vp = CK, CV
            k0, k1, k2 = cs0, cs1, cs2
            v0, v1, v2 = vs0, vs1, vs2
        # An empty physical slot has no visible keys; skip its entire plane.
        # Current planes remain fully bidirectional for both QT=2 and QT=6.
        if slot >= 0:
            for chunk in range(triton.cdiv(ROWS * COLS, BN)):
                p = chunk * BN + tl.arange(0, BN)
                ky, kx = base_y + p // COLS, base_x + p % COLS
                good_k = (p < ROWS * COLS) & (ky < HEIGHT) & (kx < WIDTH) & (slot >= 0)
                ki = tl.maximum(slot, 0) * (HEIGHT * WIDTH) + ky * WIDTH + kx
                k = tl.load(
                    kp + batch * k0 + ki[None, :] * k1 + head * k2 + d[:, None],
                    good_k[None, :],
                    0,
                ).to(tl.float32)
                # Preserve FP32 rotary arithmetic and the original BF16/FP16 cast.
                pair = tl.gather(
                    k, tl.broadcast_to((d ^ 1)[:, None], (DIM, BN)), axis=0
                )
                kc = tl.load(COS + tpos * (TD // 2) + d // 2, d < TD, 1)
                ks = tl.load(SIN + tpos * (TD // 2) + d // 2, d < TD, 0)
                k = (k * kc[:, None] + pair * ks[:, None] * sign[:, None]).to(
                    Q.dtype.element_ty
                )
                score = tl.dot(q, k).to(tl.float32) * (DIM**-0.5 * 1.4426950408889634)
                allowed = (
                    good_q[:, None]
                    & good_k[None, :]
                    & (ky[None, :] >= top[:, None])
                    & (ky[None, :] < top[:, None] + WH)
                    & (kx[None, :] >= left[:, None])
                    & (kx[None, :] < left[:, None] + WW)
                )
                score = tl.where(allowed, score, -float("inf"))
                next_max = tl.maximum(maximum, tl.max(score, 1))
                safe_max = tl.where(next_max == -float("inf"), 0.0, next_max)
                prob = tl.exp2(score - safe_max[:, None])
                correction = tl.exp2(maximum - safe_max)
                v = tl.load(
                    vp + batch * v0 + ki[:, None] * v1 + head * v2 + d[None, :],
                    good_k[:, None],
                    0,
                )
                acc = acc * correction[:, None] + tl.dot(prob.to(v.dtype), v)
                denominator = denominator * correction + tl.sum(prob, 1)
                maximum = next_max
    output = acc / tl.maximum(denominator[:, None], 1e-20)
    tl.store(
        OUT
        + ((batch * (QT * HEIGHT * WIDTH) + qi[:, None]) * HEADS + head) * DIM
        + d[None, :],
        output,
        good_q[:, None],
    )


@triton.jit
def _forward(
    Q,
    K,
    V,
    OUT,
    LSE,
    HEIGHT: tl.constexpr,
    WIDTH: tl.constexpr,
    HQ: tl.constexpr,
    HK: tl.constexpr,
    D: tl.constexpr,
    WHS: tl.constexpr,
    WWS: tl.constexpr,
    COLS: tl.constexpr,
    QF: tl.constexpr,
    NF: tl.constexpr,
    Q_OFFSET: tl.constexpr,
    TW: tl.constexpr,
    R: tl.constexpr,
    BH: tl.constexpr,
    BW: tl.constexpr,
    BM: tl.constexpr,
    BN: tl.constexpr,
):
    n: tl.constexpr = HEIGHT * WIDTH
    nf: tl.constexpr = NF
    tile_y, tile_x, bh = tl.program_id(0), tl.program_id(1), tl.program_id(2)
    qt = tile_y // triton.cdiv(HEIGHT, BH)
    tile_y = tile_y % triton.cdiv(HEIGHT, BH)
    batch, head = bh // HQ, bh % HQ
    kv_head = head // (HQ // HK)
    row = tl.arange(0, BM)
    qy, qx = tile_y * BH + row // BW, tile_x * BW + row % BW
    qi = qt * n + qy * WIDTH + qx
    valid_q = (qy < HEIGHT) & (qx < WIDTH)
    d = tl.arange(0, D)
    q = tl.load(
        Q + ((batch * HQ + head) * QF * n + qi[:, None]) * D + d[None, :],
        valid_q[:, None],
        0,
    )
    acc = tl.full((BM, D), 0, tl.float32)
    maximum = tl.full((BM,), -float("inf"), tl.float32)
    denominator = tl.full((BM,), 0, tl.float32)
    scale: tl.constexpr = D**-0.5 * 1.4426950408889634
    for source in tl.static_range(len(WHS)):
        # Preserve FlashDecoder's original block-causal groups, including
        # bidirectional visibility inside each four-frame refinement group.
        plane = ((qt + Q_OFFSET) // R - TW + 1) * R + source
        valid_plane = (plane >= 0) & (plane < NF)
        if valid_plane:
            wh = WHS[source]
            ww = WWS[source]
            cols = COLS
            rows = min(wh + BH - 1, HEIGHT)
            top, left = (
                tl.maximum(tile_y * BH - wh // 2, 0),
                tl.maximum(tile_x * BW - ww // 2, 0),
            )
            for offset in range(tl.cdiv(rows * cols, BN)):
                p = offset * BN + tl.arange(0, BN)
                ky, kx = top + p // cols, left + p % cols
                valid_k = (
                    (p < rows * cols)
                    & (ky >= 0)
                    & (ky < HEIGHT)
                    & (kx >= 0)
                    & (kx < WIDTH)
                )
                valid_k = valid_k & valid_plane
                ki = plane * n + ky * WIDTH + kx
                k = tl.load(
                    K
                    + ((batch * HK + kv_head) * nf * n + ki[None, :]) * D
                    + d[:, None],
                    valid_k[None, :],
                    0,
                )
                scores = tl.dot(q, k).to(tl.float32) * scale
                allowed = (
                    valid_k[None, :]
                    & (ky[None, :] >= qy[:, None] - wh // 2)
                    & (ky[None, :] < qy[:, None] + wh // 2)
                    & (kx[None, :] >= qx[:, None] - ww // 2)
                    & (kx[None, :] < qx[:, None] + ww // 2)
                )
                scores = tl.where(allowed, scores, -float("inf"))
                new_max = tl.maximum(maximum, tl.max(scores, 1))
                safe_max = tl.where(new_max == -float("inf"), 0.0, new_max)
                probabilities = tl.exp2(scores - safe_max[:, None])
                correction = tl.exp2(maximum - safe_max)
                v = tl.load(
                    V
                    + ((batch * HK + kv_head) * nf * n + ki[:, None]) * D
                    + d[None, :],
                    valid_k[:, None],
                    0,
                )
                acc = acc * correction[:, None] + tl.dot(probabilities.to(v.dtype), v)
                denominator = denominator * correction + tl.sum(probabilities, 1)
                maximum = new_max
    result = acc / denominator[:, None]
    tl.store(
        OUT + ((batch * HQ + head) * QF * n + qi[:, None]) * D + d[None, :],
        result,
        valid_q[:, None],
    )
    tl.store(
        LSE + (batch * HQ + head) * QF * n + qi, maximum + tl.log2(denominator), valid_q
    )

def paired_attention(q, ck, cv, pk, pv, slots, past_positions, query_positions, cos, sin, height, width, window_h, window_w):
    """The DiT's self-attention: q, ck, cv [B, frames * H * W, heads, dim] with the spatial RoPE applied; pk, pv the
    cache's physical planes, slots (-1 = empty) and positions int32; the temporal RoPE is applied here."""
    out = torch.empty_like(q, memory_format=torch.contiguous_format)
    span = height * width
    frames = q.shape[1] // span
    wh, ww = min(height, window_h), min(width, window_w)
    bh, bw, bt, key_tile = 4, 8, 2, 64
    _paired_local[(triton.cdiv(height, bh) * triton.cdiv(width, bw), triton.cdiv(frames, bt), q.shape[0] * q.shape[2])](
        q, ck, cv, pk, pv, slots, past_positions, query_positions, cos, sin, out,
        *q.stride()[:3], *ck.stride()[:3], *cv.stride()[:3], *pk.stride()[:3], *pv.stride()[:3],
        height, width, frames, slots.numel(), q.shape[2], q.shape[3], cos.shape[1] * 2, wh, ww, bh, bw, bt, bh * bw * bt, key_tile,
        min(height, wh + bh - 1), min(width, ww + bw - 1),
        num_warps=4, num_stages=2, enable_fp_fusion=False,
    )
    return out

def local_attention(q, k, v, height, width, window, group_size, temporal_window):
    """FlashDecoder's self-attention: q [B, heads, tokens, 64], k and v [B, kv heads, tokens, 64] with RoPE applied."""
    q, k, v = q.contiguous(), k.contiguous(), v.contiguous()
    b, hq, tokens, d = q.shape
    qf, nf = tokens // (height * width), k.shape[2] // (height * width)
    wh, ww = window
    output = torch.empty_like(q)
    lse = torch.empty((b, hq, tokens), device=q.device, dtype=torch.float32)
    with torch.cuda.device(q.device):
        _forward[(qf * triton.cdiv(height, 4), triton.cdiv(width, 16), b * hq)](
            q, k, v, output, lse, height, width, hq, k.shape[1], d,
            (wh,) * (temporal_window * group_size), (ww,) * (temporal_window * group_size),
            min(triton.next_power_of_2(ww + 15), triton.next_power_of_2(width)),
            qf, nf, nf - qf, temporal_window, group_size, 4, 16, 64, 64,
            num_warps=4, num_stages=2,
        )
    return output
