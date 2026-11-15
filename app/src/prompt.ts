// Midjourney-style prompt syntax: parameters (--ar, --seed…), permutations
// ({a, b}), repeat (--r) and multi-prompt weights (a::2 b).
import type { Concept, CreateSettings, LoraRef, Motion } from './comfy/types';
import type { Engine } from './comfy/config';

export interface ParsedPrompt {
  /** Text without parameters and without the weighted segments. */
  prompt: string;
  /** Multi-prompt segments with a weight (a::2), applied as concept sliders. */
  concepts: Concept[];
  /** Text without parameters, as typed. */
  plain: string;
  seed?: number;
  settings: CreateSettings;
  repeat: number;
  draft: boolean;
  tile: boolean;
  video: boolean;
  loop: boolean;
  imageWeight?: number;
  styleWeight?: number;
  /** --w: how weird the image gets, 0 or more. */
  weird?: number;
  /** --lora name::weight, once per LoRA. */
  loras: LoraRef[];
  /** --ck: a diffusion model file in place of the engine's own. */
  checkpoint?: string;
  /** --cw 0–100: how much of the character reference to keep (100 face, hair and outfit; 0 the face). */
  characterWeight?: number;
  sref?: string;
  /** --p: moodboard IDs / codes ("default" for a bare --p). */
  profiles?: string[];
  /** --anima / --moss: Imagine with Anima or MOSS Image instead of H3 Image. */
  engine: Engine;
  /** Parameters as written, for display. */
  params: string[];
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

/** Expands {a, b} groups (nested allowed; "\," is a literal comma). */
export function expandPermutations(text: string, limit = 40): string[] {
  const start = findGroup(text);
  if (!start) return [text];
  const { from, to, options } = start;
  const out: string[] = [];
  for (const opt of options) {
    for (const rest of expandPermutations(text.slice(0, from) + opt + text.slice(to + 1), limit)) {
      out.push(rest);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function findGroup(text: string): { from: number; to: number; options: string[] } | null {
  const from = text.indexOf('{');
  if (from < 0) return null;
  let depth = 0;
  let cur = '';
  const options: string[] = [];
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === ',') {
      cur += ',';
      i++;
      continue;
    }
    if (ch === '{') {
      depth++;
      if (depth === 1) continue;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        options.push(cur.trim());
        return { from, to: i, options };
      }
    } else if (ch === ',' && depth === 1) {
      options.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  return null; // unbalanced: leave as is
}

/** "space::2 ship" → the prompt "ship" and the concept "space" at 2 (the concept sliders' strength, 1 = as written).
    Segments without a weight, or weighted 1, stay in the prompt; weights of 0 or less are dropped. */
function applyWeights(text: string): { prompt: string; concepts: Concept[] } {
  if (!text.includes('::')) return { prompt: text, concepts: [] };
  const parts = text.split(/::/);
  const plain: string[] = [];
  const concepts: Concept[] = [];
  let pending = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^\s*(-?\d*\.?\d+)?\s*(.*)$/s)!;
    const weight = m[1] !== undefined ? Number(m[1]) : 1;
    const seg = pending.trim();
    if (seg && weight === 1) plain.push(seg);
    else if (seg && weight > 0) concepts.push({ text: seg, weight });
    pending = m[2] ?? '';
  }
  if (pending.trim()) plain.push(pending.trim());
  return { prompt: plain.join(' '), concepts };
}

const ASPECT = /^\d+:\d+$/;

export function parsePrompt(text: string, base: CreateSettings): ParsedPrompt {
  const s: CreateSettings = { ...base };
  const r: ParsedPrompt = {
    prompt: '',
    plain: '',
    concepts: [],
    loras: [],
    settings: s,
    repeat: 1,
    draft: false,
    tile: false,
    video: false,
    loop: false,
    engine: 'h3',
    params: [],
  };
  // Split at the first " --" (parameters always go at the end).
  const idx = text.search(/(^|\s)--[a-z]/i);
  const body = idx >= 0 ? text.slice(0, idx) : text;
  const tail = idx >= 0 ? text.slice(idx) : '';
  const tokens = tail.split(/\s+(?=--)/).map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    const m = tok.match(/^--([a-z]+)\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    r.params.push(`--${key}${val ? ' ' + val : ''}`);
    switch (key) {
      case 'ar':
      case 'aspect':
        if (ASPECT.test(val)) s.aspect = val;
        break;
      case 'seed': {
        const n = Number.parseInt(val, 10);
        if (Number.isFinite(n)) r.seed = clamp(n, 0, 4294967295);
        break;
      }
      case 'c':
      case 'chaos':
        s.chaos = clamp(Number(val), 0, 100);
        break;
      case 'r':
      case 'repeat':
        r.repeat = clamp(Math.round(Number(val)) || 1, 1, 40);
        break;
      case 'hd':
        s.resolution = 'hd';
        s.videoResolution = 'hd';
        break;
      case 'sd':
        s.resolution = 'sd';
        s.videoResolution = 'sd';
        break;
      case 'draft':
        r.draft = true;
        break;
      case 'tile':
        r.tile = true;
        break;
      case 'video':
        r.video = true;
        break;
      case 'motion':
        if (val === 'low' || val === 'high') s.motion = val as Motion;
        break;
      case 'loop':
        r.loop = true;
        break;
      case 'bs': {
        const n = Number(val);
        if (n === 1 || n === 2 || n === 4) s.videoBatch = n;
        break;
      }
      case 'iw':
        r.imageWeight = clamp(Number(val), 0, 3);
        break;
      case 'cw':
        r.characterWeight = clamp(Number(val), 0, 100);
        break;
      case 'sw':
        r.styleWeight = Math.max(0, Number(val) || 0);
        break;
      case 'w':
      case 'weird':
        r.weird = Math.max(0, Number(val) || 0);
        break;
      case 'lora': {
        // The name runs to the next parameter, so it may have spaces; ::weight is optional and 0 drops it.
        const lora = val.match(/^(.*?)(?:::(-?\d*\.?\d+))?$/);
        const weight = lora?.[2] === undefined ? 1 : Number(lora[2]);
        if (lora?.[1].trim() && weight !== 0) r.loras.push({ name: lora[1].trim(), weight });
        break;
      }
      case 'ck':
        if (val) r.checkpoint = val;
        break;
      case 'sref':
        r.sref = val;
        break;
      case 'p':
      case 'profile':
      case 'personalize':
        r.profiles = val ? val.split(/\s+/) : ['default'];
        break;
      case 'anima':
      case 'moss':
        r.engine = key;
        break;
      // --v, --niji, --stealth, --public… are accepted and kept for display.
    }
  }
  const plain = body.replace(/\s+/g, ' ').trim();
  const w = applyWeights(plain);
  r.plain = plain;
  r.prompt = w.prompt;
  r.concepts = w.concepts;
  return r;
}
