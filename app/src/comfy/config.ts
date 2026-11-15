// Models and sizes the built-in workflows use, saved in ComfyUI's user folder (lumen/config.json).
import type { ActionKind } from './types';
import { save, saved } from '../saved';

export type Engine = 'h3' | 'anima' | 'moss';

export interface EngineSizes {
  /** Megapixels of a normal image and of an HD one (--hd). */
  sd: number;
  hd: number;
}

export interface ComfyConfig {
  /** MiniMax H3 Image: every action; the distilled model samples 6 steps of LCM. */
  h3: EngineSizes & { unet: string; clip: string; vae: string; sigmas: string; sNoise: number; sNoiseEnd: number };
  /** Anima (--anima) and MOSS Image (--moss), each with its turbo LoRA: Imagine only, every edit runs on H3 Image. */
  anima: EngineSizes & { unet: string; lora: string; clip: string; vae: string; steps: number; cfg: number; sampler: string; scheduler: string; negative: string };
  moss: EngineSizes & { unet: string; lora: string; clip: string; vae: string; steps: number; cfg: number; sampler: string; scheduler: string; negative: string };
  /** Megapixels of draft images (--draft) and of Upscale. */
  draftMegapixels: number;
  upscaleMegapixels: number;
  /** Custom workflows (ComfyUI "Export (API)" JSON) per action; empty = built-in. */
  workflows: Partial<Record<ActionKind, string>>;
}

export const DEFAULT_CONFIG: ComfyConfig = {
  h3: {
    unet: 'minimax/minimax_h3_image_pruned_int8_convrot.safetensors',
    clip: 'minimax/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    vae: 'minimax/minimax_h3_image_vae_fp16.safetensors',
    sigmas: '1.0, 0.9675236940383911, 0.8875485062599182, 0.75, 0.5327739119529724, 0.23200887441635132, 0.0',
    sNoise: 0.95,
    sNoiseEnd: 0.9,
    sd: 1,
    hd: 4,
  },
  anima: {
    unet: 'anima/anima-base-v1.0.safetensors',
    lora: 'anima/anima-turbo-lora-v0.1.safetensors',
    clip: 'qwen_3_06b_base.safetensors',
    vae: 'qwen_image_vae.safetensors',
    steps: 8,
    cfg: 1,
    sampler: 'euler',
    scheduler: 'simple',
    negative: 'worst quality, low quality, blurry, jpeg artifacts',
    sd: 1,
    hd: 2,
  },
  moss: {
    unet: 'moss/moss_image_sft_int8_convrot.safetensors',
    lora: 'moss/moss_image_sft_8step_dmd.safetensors',
    clip: 'moss/qwen3.5_9b_int8_convrot.safetensors',
    vae: 'flux2-vae.safetensors',
    steps: 8,
    cfg: 1,
    sampler: 'er_sde',
    scheduler: 'simple',
    negative: '',
    sd: 1,
    hd: 4,
  },
  draftMegapixels: 0.5,
  upscaleMegapixels: 16,
  workflows: {},
};

type Listener = () => void;
const listeners = new Set<Listener>();
let current: ComfyConfig = load();

function load(): ComfyConfig {
  const s = saved<Partial<ComfyConfig>>('config') ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...s,
    h3: { ...DEFAULT_CONFIG.h3, ...s.h3 },
    anima: { ...DEFAULT_CONFIG.anima, ...s.anima },
    moss: { ...DEFAULT_CONFIG.moss, ...s.moss },
  };
}

export function getConfig(): ComfyConfig {
  return current;
}

export function setConfig(patch: Partial<ComfyConfig>) {
  current = { ...current, ...patch };
  save('config', current);
  listeners.forEach((l) => l());
}

export function subscribeConfig(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
