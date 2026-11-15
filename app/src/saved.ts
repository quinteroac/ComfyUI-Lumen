import { t } from './i18n';
// What Lumen keeps (jobs, settings, styles, saved searches) lives in ComfyUI's user folder,
// one JSON file per name under user/<user>/lumen/, read once before the app starts.
const files: Record<string, unknown> = {};
const timers: Record<string, number> = {};

const fileUrl = (name: string) => `/api/userdata/${encodeURIComponent(`lumen/${name}.json`)}`;

export async function loadSaved(names: string[]) {
  await Promise.all(
    names.map(async (name) => {
      const res = await fetch(fileUrl(name));
      if (res.ok) files[name] = await res.json();
      else if (res.status !== 404) throw new Error(t('No se pudo leer lumen/{name}.json ({status}).', { name, status: res.status }));
    }),
  );
}

export const saved = <T,>(name: string): T | undefined => files[name] as T | undefined;

function write(name: string, keepalive = false) {
  delete timers[name];
  void fetch(fileUrl(name), { method: 'POST', body: JSON.stringify(files[name]), keepalive }).then((res) => {
    if (!res.ok) console.error(t('Lumen: no se pudo guardar lumen/{name}.json ({status})', { name, status: res.status }));
  });
}

/** Writes are grouped: the latest value of each file is sent half a second after the last change. */
export function save(name: string, value: unknown) {
  files[name] = value;
  window.clearTimeout(timers[name]);
  timers[name] = window.setTimeout(() => write(name), 500);
}

// Closing or reloading the page sends what is still waiting (browsers drop keepalive bodies over 64 KB).
window.addEventListener('pagehide', () => {
  for (const name of Object.keys(timers)) {
    window.clearTimeout(timers[name]);
    write(name, true);
  }
});
