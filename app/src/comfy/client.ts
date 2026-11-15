// Minimal ComfyUI HTTP + WebSocket client for the server that serves this page.
import type { ApiWorkflow } from './workflows';

export interface ImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

export interface RunCallbacks {
  onQueued?: (promptId: string) => void;
  onProgress?: (fraction: number, label: string) => void;
}

const CLIENT_ID_KEY = 'lumen.comfy.clientId';
export const clientId: string = (() => {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
})();

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, init);
  } catch {
    throw new Error('No se pudo conectar con ComfyUI. ¿Sigue encendido?');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message ?? '';
      const nodeErrors = body?.node_errors ? Object.values(body.node_errors as Record<string, { errors?: { message: string; details: string }[] }>) : [];
      const first = nodeErrors[0]?.errors?.[0];
      if (first) detail += ` — ${first.message}: ${first.details}`;
    } catch {
      /* not json */
    }
    throw new Error(`ComfyUI respondió ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

export function viewUrl(ref: ImageRef) {
  const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder, type: ref.type });
  return `/api/view?${q}`;
}

/** Checks the server and returns its version / GPU name. */
export async function testConnection() {
  const stats = await http<{ system?: { comfyui_version?: string }; devices?: { name: string }[] }>('/system_stats');
  return { version: stats.system?.comfyui_version ?? '?', device: stats.devices?.[0]?.name ?? '?' };
}

type NodeInfo = { input: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } };
let objectInfo: Promise<Record<string, NodeInfo>> | undefined;

/** The server's node definitions, read once per page load. */
export function nodeDefs(): Promise<Record<string, NodeInfo>> {
  objectInfo ??= http<Record<string, NodeInfo>>('/object_info').catch((e) => {
    objectInfo = undefined;
    throw e;
  });
  return objectInfo;
}

/** Options of a combo input, e.g. the files UNETLoader can load. */
export function comboOptions(defs: Record<string, NodeInfo>, node: string, input: string): string[] {
  const spec = defs[node]?.input.required?.[input] ?? defs[node]?.input.optional?.[input];
  const first = spec?.[0];
  if (Array.isArray(first)) return first as string[];
  const opts = (spec?.[1] as { options?: string[] } | undefined)?.options;
  return Array.isArray(opts) ? opts : [];
}

/** Puts an image in ComfyUI's input folder so LoadImage can use it. */
export async function uploadImage(blob: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append('image', blob, name);
  form.append('overwrite', 'true');
  const r = await http<{ name: string; subfolder?: string }>('/upload/image', { method: 'POST', body: form });
  return r.subfolder ? `${r.subfolder}/${r.name}` : r.name;
}

/** Copies an image that ComfyUI already made (output folder) into its input folder. */
export async function reuseOutputAsInput(ref: ImageRef): Promise<string> {
  const res = await fetch(viewUrl(ref));
  if (!res.ok) throw new Error('No se pudo leer la imagen desde ComfyUI.');
  return uploadImage(await res.blob(), `lumen_src_${ref.filename}`);
}

export interface AssistantAnswer {
  reply: string;
  prompt: string;
  image_action: { kind: 'none' | 'vary_subtle' | 'vary_strong' | 'upscale_subtle' | 'animate'; image: number };
}

/** One conversational turn: the pack's route loads the GGUF in its own process, answers and releases it. */
export async function askAssistant(body: { model: string; settings: Record<string, number>; message: string; current_prompt: string; images: number }): Promise<AssistantAnswer> {
  const res = await fetch('/lumen/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `El asistente respondió ${res.status}.` }));
  if (!res.ok) throw new Error(data.error ?? `El asistente respondió ${res.status}.`);
  return data as AssistantAnswer;
}

/** GGUF files the conversational mode can use. */
export async function llmModels(): Promise<string[]> {
  const res = await fetch('/lumen/llm/models');
  return res.ok ? res.json() : [];
}

/** Stops this prompt if it is the one running (other jobs keep going). */
export async function interrupt(promptId: string) {
  await http('/interrupt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_id: promptId }),
  }).catch(() => undefined);
}

export async function deleteFromQueue(promptId: string) {
  await http('/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delete: [promptId] }),
  }).catch(() => undefined);
}

type NodeOutput = { images?: ImageRef[]; gifs?: ImageRef[]; videos?: ImageRef[]; video?: ImageRef[]; text?: unknown; string?: unknown };

export interface RunResult {
  files: ImageRef[];
  /** Text outputs (e.g. captions from a Describe workflow: ShowText / PreviewAny nodes). */
  texts: string[];
  /** Text of the nodes the workflow titled (_meta.title), e.g. the built-in "caption" and "styles". */
  titled: Record<string, string>;
}

function nodeTexts(node: NodeOutput): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
    else if (Array.isArray(v)) v.forEach(add);
  };
  add(node.text);
  add(node.string);
  return out;
}

const textsFrom = (entry: History[string]) => Object.values(entry.outputs ?? {}).flatMap(nodeTexts);

function titledFrom(entry: History[string], workflow: ApiWorkflow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, node] of Object.entries(entry.outputs ?? {})) {
    const title = workflow[id]?._meta?.title;
    const text = nodeTexts(node)[0];
    if (title && text) out[title] = text;
  }
  return out;
}
type History = Record<string, { status?: { completed?: boolean; status_str?: string; messages?: [string, { exception_message?: string }][] }; outputs?: Record<string, NodeOutput> }>;

/** Files a run produced: images, animated WEBP/GIF and videos (VideoHelperSuite lists them under "gifs"). */
function imagesFrom(entry: History[string]): ImageRef[] {
  const all: ImageRef[] = [];
  for (const node of Object.values(entry.outputs ?? {})) all.push(...(node.videos ?? []), ...(node.video ?? []), ...(node.gifs ?? []), ...(node.images ?? []));
  const saved = all.filter((r) => r.type === 'output');
  return saved.length ? saved : all;
}

export function isVideoFile(name: string) {
  return /\.(mp4|webm|mov|mkv)$/i.test(name);
}

/**
 * Sends a workflow to ComfyUI (POST /prompt), follows its progress over the
 * WebSocket (falls back to polling /history) and resolves with the images.
 */
export async function runWorkflow(workflow: ApiWorkflow, cb: RunCallbacks = {}, signal?: AbortSignal): Promise<RunResult> {
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?clientId=${encodeURIComponent(clientId)}`;
  let ws: WebSocket | undefined;
  try {
    ws = new WebSocket(wsUrl);
  } catch {
    ws = undefined;
  }

  const queued = await http<{ prompt_id: string; number: number }>('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  const promptId = queued.prompt_id;
  cb.onQueued?.(promptId);

  const nodeCount = Object.keys(workflow).length || 1;
  const doneNodes = new Set<string>();

  return new Promise<RunResult>((resolve, reject) => {
    let finished = false;
    let poll: number | undefined;

    const finish = (err?: Error, result?: RunResult) => {
      if (finished) return;
      finished = true;
      window.clearInterval(poll);
      ws?.close();
      if (err) reject(err);
      else resolve(result ?? { files: [], texts: [], titled: {} });
    };

    const checkHistory = async () => {
      try {
        const h = await http<History>(`/history/${promptId}`);
        const entry = h[promptId];
        if (!entry) return;
        if (entry.status?.status_str === 'error') {
          const msg = entry.status.messages?.find((m) => m[0] === 'execution_error')?.[1]?.exception_message;
          finish(new Error(msg ? `Error en ComfyUI: ${msg}` : 'ComfyUI falló al ejecutar el workflow.'));
        } else if (entry.status?.completed || entry.outputs) {
          finish(undefined, { files: imagesFrom(entry), texts: textsFrom(entry), titled: titledFrom(entry, workflow) });
        }
      } catch {
        /* keep trying */
      }
    };

    signal?.addEventListener('abort', () => {
      void deleteFromQueue(promptId);
      void interrupt(promptId);
      finish(new DOMException('cancelado', 'AbortError') as unknown as Error);
    });

    // Polling backs up the WebSocket (and replaces it if it can't connect).
    poll = window.setInterval(checkHistory, ws ? 4000 : 1500);

    if (ws) {
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return; // binary = live previews
        let msg: { type: string; data: Record<string, unknown> };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        const d = msg.data ?? {};
        if (d.prompt_id && d.prompt_id !== promptId) return;
        switch (msg.type) {
          case 'execution_start':
            cb.onProgress?.(0.02, 'Empezando…');
            break;
          case 'execution_cached':
            for (const n of (d.nodes as string[]) ?? []) doneNodes.add(n);
            break;
          case 'executing':
            if (d.node === null) void checkHistory();
            else if (typeof d.node === 'string') {
              doneNodes.add(d.node);
              cb.onProgress?.(Math.min(0.95, doneNodes.size / nodeCount), 'Procesando…');
            }
            break;
          case 'progress': {
            const v = Number(d.value), m = Number(d.max) || 1;
            cb.onProgress?.(Math.min(0.97, 0.1 + 0.85 * (v / m)), `${Math.round((v / m) * 100)}%`);
            break;
          }
          case 'execution_success':
            void checkHistory();
            break;
          case 'execution_error':
            finish(new Error(`Error en ComfyUI: ${String(d.exception_message ?? 'desconocido')}`));
            break;
          case 'execution_interrupted':
            finish(new Error('Interrumpido en ComfyUI.'));
            break;
        }
      };
      ws.onerror = () => {
        window.clearInterval(poll);
        poll = window.setInterval(checkHistory, 1500);
      };
    }
  });
}
