// Midjourney-style prompt syntax: parameters (--ar, --no, --seed…), permutations
// ({a, b}), repeat (--r) and multi-prompt weights (a::2 b).
import type { CreateSettings, Motion } from './comfy/types';
import type { Engine } from './comfy/config';
import { styleByCode } from './styles';

export interface ParsedPrompt {
  /** Text without parameters, with multi-prompt weights turned into ComfyUI (text:weight) syntax. */
  prompt: string;
  /** Text without parameters, as typed. */
  plain: string;
  negative: string;
  seed?: number;
  settings: CreateSettings;
  quality: number;
  repeat: number;
  draft: boolean;
  tile: boolean;
  video: boolean;
  loop: boolean;
  imageWeight?: number;
  styleWeight?: number;
  sref?: string;
  /** --p: moodboard IDs / codes ("default" for a bare --p). */
  profiles?: string[];
  /** Style words added by --sref codes. */
  styleWords: string;
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

/** "space::2 ship::-0.5" → positive "(space:2) ship"… negative weights go to the negative prompt. */
function applyWeights(text: string): { positive: string; negative: string } {
  if (!text.includes('::')) return { positive: text, negative: '' };
  const parts = text.split(/::/);
  const pos: string[] = [];
  const neg: string[] = [];
  let pending = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^\s*(-?\d*\.?\d+)?\s*(.*)$/s)!;
    const w = m[1] !== undefined ? Number(m[1]) : 1;
    const seg = pending.trim();
    if (seg) {
      if (w < 0) neg.push(seg);
      else pos.push(w === 1 ? seg : `(${seg}:${w})`);
    }
    pending = m[2] ?? '';
  }
  if (pending.trim()) pos.push(pending.trim());
  return { positive: pos.join(' '), negative: neg.join(', ') };
}

const ASPECT = /^\d+:\d+$/;

export function parsePrompt(text: string, base: CreateSettings): ParsedPrompt {
  const s: CreateSettings = { ...base };
  const r: ParsedPrompt = {
    prompt: '',
    plain: '',
    negative: '',
    settings: s,
    quality: 1,
    repeat: 1,
    draft: false,
    tile: false,
    video: false,
    loop: false,
    styleWords: '',
    engine: 'h3',
    params: [],
  };
  // Split at the first " --" (parameters always go at the end).
  const idx = text.search(/(^|\s)--[a-z]/i);
  const body = idx >= 0 ? text.slice(0, idx) : text;
  const tail = idx >= 0 ? text.slice(idx) : '';
  const tokens = tail.split(/\s+(?=--)/).map((t) => t.trim()).filter(Boolean);
  const negatives: string[] = [];
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
      case 'no':
        if (val) negatives.push(val);
        break;
      case 'seed': {
        const n = Number.parseInt(val, 10);
        if (Number.isFinite(n)) r.seed = clamp(n, 0, 4294967295);
        break;
      }
      case 's':
      case 'stylize':
        s.stylize = clamp(Number(val), 0, 1000);
        break;
      case 'c':
      case 'chaos':
        s.chaos = clamp(Number(val), 0, 100);
        break;
      case 'w':
      case 'weird':
        s.weird = clamp(Number(val), 0, 3000);
        break;
      case 'raw':
        s.mode = 'raw';
        break;
      case 'style':
        if (val === 'raw') s.mode = 'raw';
        break;
      case 'q':
      case 'quality':
        r.quality = clamp(Number(val) || 1, 0.25, 4);
        break;
      case 'r':
      case 'repeat':
        r.repeat = clamp(Math.round(Number(val)) || 1, 1, 40);
        break;
      case 'fast':
      case 'relax':
      case 'turbo':
        s.speed = key;
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
      case 'sw':
        r.styleWeight = clamp(Number(val), 0, 1000);
        break;
      case 'sref': {
        r.sref = val;
        const words = val
          .split(/\s+/)
          .map((c) => styleByCode(c)?.words)
          .filter(Boolean);
        r.styleWords = words.join(', ');
        break;
      }
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
  r.prompt = [w.positive, r.styleWords].filter(Boolean).join(', ');
  r.negative = [...negatives, w.negative].filter(Boolean).join(', ');
  return r;
}
