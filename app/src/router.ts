import { useSyncExternalStore } from 'react';

export type Route = 'explore' | 'imagine' | 'edit' | 'personalize' | 'moodboards' | 'style-creator' | 'organize' | 'comfyui' | 'docs';
export const ROUTES: Route[] = ['explore', 'imagine', 'edit', 'personalize', 'moodboards', 'style-creator', 'organize', 'comfyui', 'docs'];

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

/** The app is served by the ComfyUI-Lumen pack under this path. */
const BASE = '/lumen/';
export const routeHref = (route: Route) => BASE + route;

export function routeOf(path: string): Route {
  const seg = (path.startsWith(BASE) ? path.slice(BASE.length) : '').split('/')[0];
  // The help page became the docs.
  if (seg === 'help') return 'docs';
  return ROUTES.includes(seg as Route) ? (seg as Route) : 'explore';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => routeOf(location.pathname));
}

/** The docs article in /lumen/docs/<slug>, or '' for the docs home. */
export function useDocSlug(): string {
  return useSyncExternalStore(subscribe, () => (routeOf(location.pathname) === 'docs' ? (location.pathname.split('/')[3] ?? '') : ''));
}

export function navigateDoc(slug = '') {
  const path = `${BASE}docs${slug ? `/${slug}` : ''}`;
  if (location.pathname !== path) history.pushState(null, '', path);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
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
