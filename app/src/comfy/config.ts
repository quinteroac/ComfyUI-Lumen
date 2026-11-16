// Models and sizes the built-in workflows use, saved in ComfyUI's user folder (lumen/config.json).
import type { ActionKind } from './types';
import { save, saved } from '../saved';

export type Engine = 'h3' | 'anima' | 'moss';

export interface EngineSizes {
  /** Megapixels of a draft (--draft), a normal and an HD image (--hd). */
  draft: number;
  sd: number;
  hd: number;
}

export interface ComfyConfig {
  /** MiniMax H3 Image: every action; the distilled model samples 6 steps of LCM. peClip runs the official edit prompt enhancer for Zoom out and Pan. */
  h3: EngineSizes & { unet: string; clip: string; vae: string; peClip: string; sigmas: string; sNoise: number; sNoiseEnd: number };
  /** Anima (--anima) and MOSS Image (--moss), each with its turbo LoRA: Imagine only, every edit runs on H3 Image. */
  /** snapref / snaprefMode: the SnapRef adapter and its mode (cs: character and style, char: character only) for --cref. */
  anima: EngineSizes & { unet: string; lora: string; clip: string; vae: string; steps: number; cfg: number; sampler: string; scheduler: string; negative: string; snapref: string; snaprefMode: 'cs' | 'char' };
  moss: EngineSizes & { unet: string; lora: string; clip: string; vae: string; steps: number; cfg: number; sampler: string; scheduler: string; negative: string };
  /** Styles each --sref code mixes (Style Code nodes); Anima mixes styles and artist tags. previewPrompt: what Explore's style previews show. */
  styleCodes: { styles: number; animaStyles: number; animaArtists: number; previewPrompt: string };
  /** How the concept sliders apply a::2 weights: attention biases how much the image attends to the concept,
      weight_norm scales its attention values keeping each output at the magnitude of the concept as written. */
  conceptMode: 'attention' | 'weight_norm';
  /** Conversational mode: a GGUF under models/LLM, loaded for each message in its own process and released after it. */
  llm: { model: string; nGpuLayers: number; nCtx: number; maxTokens: number; temperature: number };
  /** H3 video: the base fl2va (no references) and ref2va (with references) models, each with its Pika Flex LoRA,
      Pika's sigmas with lcm, and the video and audio VAEs. sd / hd in megapixels, frames at 24 fps.
      vsr / vsrVae: RelayVSR ×2, which upscales a finished video; recavsr*: ReCaVSR ×4. */
  video: { fl2va: string; fl2vaLora: string; ref2va: string; ref2vaLora: string; vae: string; audioVae: string; sigmas: string; sd: number; hd: number; frames: number; vsr: string; vsrVae: string; recavsr: string; recavsrPrompt: string; recavsrDecoder: string };
  /** Megapixels of Upscale. */
  upscaleMegapixels: number;
  /** Custom workflows (ComfyUI "Export (API)" JSON) per action; empty = built-in. */
  workflows: Partial<Record<ActionKind, string>>;
}

export const DEFAULT_CONFIG: ComfyConfig = {
  h3: {
    unet: 'minimax/minimax_h3_image_pruned_int8_convrot.safetensors',
    clip: 'minimax/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    vae: 'minimax/minimax_h3_image_vae_fp16.safetensors',
    peClip: 'moss/qwen3.5_9b_w4a8_gptq.safetensors',
    sigmas: '1.0, 0.9675236940383911, 0.8875485062599182, 0.75, 0.5327739119529724, 0.23200887441635132, 0.0',
    sNoise: 0.95,
    sNoiseEnd: 0.9,
    draft: 1,
    sd: 4,
    hd: 16,
  },
  anima: {
    unet: 'anima/anima-base-v1.0.safetensors',
    lora: 'anima/anima-turbo-lora-v0.2.safetensors',
    clip: 'qwen_3_06b_base.safetensors',
    vae: 'qwen_image_vae.safetensors',
    steps: 8,
    cfg: 1,
    sampler: 'euler',
    scheduler: 'simple',
    negative: 'worst quality, low quality, blurry, jpeg artifacts',
    snapref: 'snapref_v2a_pre2.safetensors',
    snaprefMode: 'cs',
    draft: 1,
    sd: 1,
    hd: 1,
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
    draft: 1,
    sd: 2,
    hd: 5,
  },
  styleCodes: {
    styles: 4,
    animaStyles: 2,
    animaArtists: 2,
    previewPrompt: 'A young woman with a bicycle on a city street beside a small flower shop, trees, a cat on a bench, daylight',
  },
  conceptMode: 'attention',
  video: {
    fl2va: 'minimax/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    fl2vaLora: 'minimax/pika/pika_h3_flex_fl2va_comfy_bf16.safetensors',
    ref2va: 'minimax/minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    ref2vaLora: 'minimax/pika/pika_h3_flex_ref2va_comfy_bf16.safetensors',
    vae: 'minimax/minimax_h3_video_vae_int8_convrot.safetensors',
    audioVae: 'minimax/minimax_h3_audio_vae_fp32.safetensors',
    sigmas: '1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0',
    sd: 0.5,
    hd: 1,
    frames: 124,
    vsr: 'relayvsr/relayvsr_x2_lightx2v_int8_convrot.safetensors',
    vsrVae: 'relayvsr/relayvsr_flash_vae_x2_fp32.safetensors',
    recavsr: 'recavsr/recavsr_transformer_int8_convrot.safetensors',
    recavsrPrompt: 'recavsr/recavsr_prompt.safetensors',
    recavsrDecoder: 'recavsr/recavsr_flashdecoder_fp32.safetensors',
  },
  llm: { model: 'gemma-4-12b-heretic-Q6_K.gguf', nGpuLayers: -1, nCtx: 8192, maxTokens: 1024, temperature: 0.7 },
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
    styleCodes: { ...DEFAULT_CONFIG.styleCodes, ...s.styleCodes },
    llm: { ...DEFAULT_CONFIG.llm, ...s.llm },
    video: { ...DEFAULT_CONFIG.video, ...s.video },
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
