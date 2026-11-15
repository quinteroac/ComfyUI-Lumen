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
      else if (res.status !== 404) throw new Error(`No se pudo leer lumen/${name}.json (${res.status}).`);
    }),
  );
}

export const saved = <T,>(name: string): T | undefined => files[name] as T | undefined;

/** Writes are grouped: the latest value of each file is sent half a second after the last change. */
export function save(name: string, value: unknown) {
  files[name] = value;
  window.clearTimeout(timers[name]);
  timers[name] = window.setTimeout(() => {
    void fetch(fileUrl(name), { method: 'POST', body: JSON.stringify(files[name]) }).then((res) => {
      if (!res.ok) console.error(`Lumen: no se pudo guardar lumen/${name}.json (${res.status})`);
    });
  }, 500);
}
