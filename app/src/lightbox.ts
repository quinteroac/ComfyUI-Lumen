import { useSyncExternalStore } from 'react';
import type { JobImage } from './comfy/types';

export interface LbItem {
  img: JobImage;
  prompt: string;
  /** Present when the image is one of your jobs. */
  jobId?: string;
  index?: number;
  /** Present for gallery (Explore) images. */
  exploreId?: string;
  meta?: string[];
}

let open: { items: LbItem[]; index: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openLightbox(items: LbItem[], index: number) {
  open = { items, index };
  emit();
}
export function closeLightbox() {
  open = null;
  emit();
}
export function stepLightbox(d: number) {
  if (!open) return;
  const n = open.items.length;
  open = { ...open, index: (open.index + d + n) % n };
  emit();
}
export function useLightbox() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
