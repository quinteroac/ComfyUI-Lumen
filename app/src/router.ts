import { useSyncExternalStore } from 'react';

export type Route = 'explore' | 'imagine' | 'edit' | 'personalize' | 'moodboards' | 'style-creator' | 'organize' | 'comfyui' | 'help';
export const ROUTES: Route[] = ['explore', 'imagine', 'edit', 'personalize', 'moodboards', 'style-creator', 'organize', 'comfyui', 'help'];

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

/** The app is served by the ComfyUI-Lumen pack under this path. */
const BASE = '/lumen/';
export const routeHref = (route: Route) => BASE + route;

export function routeOf(path: string): Route {
  const seg = (path.startsWith(BASE) ? path.slice(BASE.length) : '').split('/')[0] as Route;
  return ROUTES.includes(seg) ? seg : 'explore';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => routeOf(location.pathname));
}

/** Reads a ?query parameter (e.g. the Explore search). */
export function useQueryParam(name: string): string {
  return useSyncExternalStore(subscribe, () => new URLSearchParams(location.search).get(name) ?? '');
}

export function navigate(route: Route, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params)}` : '';
  const path = routeHref(route) + q;
  if (location.pathname + location.search !== path) history.pushState(null, '', path);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}
