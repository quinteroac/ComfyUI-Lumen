// Real previews of --sref codes: one small H3 Image render per code and prompt, made one at a time on demand
// and kept in ComfyUI's user folder (lumen/stylepreviews.json), with the styles the code mixed.
import { useSyncExternalStore } from 'react';
import { getConfig } from './comfy/config';
import { buildWorkflow, checkWorkflow } from './comfy/workflows';
import { nodeDefs, runWorkflow, viewUrl } from './comfy/client';
import type { JobImage } from './comfy/types';
import { baseInputs, getState, parsePrompt } from './store';
import { save, saved } from './saved';
import { t } from './i18n';

export interface StylePreview {
  code: string;
  prompt: string;
  status: 'queued' | 'running' | 'done' | 'error';
  image?: JobImage;
  /** The node's list: one "Label (category) weight" per line. */
  styles?: string;
  error?: string;
  createdAt: number;
}

/** Previews share a seed so that codes compare on the same picture. */
const SEED = 20261114;
const listeners = new Set<() => void>();
let previews: Record<string, StylePreview> = Object.fromEntries(
  Object.entries(saved<Record<string, StylePreview>>('stylepreviews') ?? {}).filter(([, p]) => p.status === 'done'),
);
let queue: Promise<void> = Promise.resolve();

export const previewKey = (code: string, prompt: string) => `${code}|${prompt}`;

function update(key: string, patch: Partial<StylePreview>) {
  previews = { ...previews, [key]: { ...previews[key], ...patch } };
  if (patch.status === 'done') save('stylepreviews', Object.fromEntries(Object.entries(previews).filter(([, p]) => p.status === 'done')));
  listeners.forEach((l) => l());
}

export function usePreviews(): Record<string, StylePreview> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => previews,
  );
}

export const randomCode = () => String(1 + Math.floor(Math.random() * 4294967295));

/** Queues a preview of the code on the prompt (Explore uses the preview prompt from the ComfyUI page). */
export function requestPreview(code: string, prompt = getConfig().styleCodes.previewPrompt) {
  const key = previewKey(code, prompt);
  if (previews[key] && previews[key].status !== 'error') return;
  update(key, { code, prompt, status: 'queued', createdAt: Date.now(), error: undefined });
  queue = queue.then(() => render(key));
}

async function render(key: string) {
  const p = previews[key];
  update(key, { status: 'running' });
  try {
    const parsed = parsePrompt(`${p.prompt} --ar 3:4 --draft --sref ${p.code}`, getState().settings);
    const inputs = { ...baseInputs('imagine', parsed, false), engine: 'h3' as const, seed: SEED, batch: 1 };
    const { workflow } = buildWorkflow(inputs);
    checkWorkflow(workflow, await nodeDefs());
    const out = await runWorkflow(workflow);
    const file = out.files[0];
    if (!file) throw new Error(t('ComfyUI no devolvió imagen.'));
    update(key, { status: 'done', image: { url: viewUrl(file), ref: file, w: inputs.width, h: inputs.height }, styles: out.texts[0] });
  } catch (e) {
    update(key, { status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** "Silver Age Comics (comics) 2.26" lines → labels, heaviest first. */
export function styleLabels(styles?: string): { label: string; weight: number }[] {
  return (styles ?? '')
    .split('\n')
    .map((line) => line.match(/^(.*) \(([^)]*)\) (-?[\d.]+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ label: m[1].replace(/\\/g, ''), weight: Number(m[3]) }))
    .sort((a, b) => b.weight - a.weight);
}

/** Card title: the two heaviest styles. */
export const styleTitle = (styles?: string) => styleLabels(styles).slice(0, 2).map((s) => s.label).join(' + ');
