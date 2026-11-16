// Lumen's side of its MCP server (mcp/server.mjs): the page long-polls the pack for commands and runs them as the
// buttons do, so MCP jobs use the same enhancer, references and settings and show up live in Create.
import { viewUrl, type ImageRef } from './comfy/client';
import type { ActionKind, Job, JobRefs, Motion, PanDir, RefImage } from './comfy/types';
import { cancelJob, getState, imagine, runAction } from './store';

type Role = 'image' | 'style' | 'character' | 'start' | 'end';
/** A picture: one of Lumen's images (job + index) or a file the MCP server put in ComfyUI's input folder. */
interface McpRef {
  role: Role;
  job?: string;
  index?: number;
  ref?: ImageRef;
}

const ACTIONS: ActionKind[] = ['vary_subtle', 'vary_strong', 'upscale_subtle', 'upscale_creative', 'remix', 'zoom_out', 'pan', 'retexture', 'animate', 'extend', 'upscale_video', 'describe'];

function jobImage(jobId: string, index = 0) {
  const job = getState().jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`No job ${jobId}.`);
  const img = job.images[index];
  if (!img) throw new Error(`Job ${jobId} has no image ${index}.`);
  return { job, img };
}

function size(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => rej(new Error('ComfyUI could not show a reference picture.'));
    img.src = url;
  });
}

async function toRef(r: McpRef, n: number): Promise<RefImage> {
  if (r.job) {
    const { img } = jobImage(r.job, r.index);
    return { id: `mcp${n}`, url: img.url, w: img.w, h: img.h, name: img.ref?.filename ?? `mcp${n}.png`, ref: img.ref };
  }
  if (!r.ref) throw new Error('A reference needs a job or a file.');
  const url = viewUrl(r.ref);
  return { id: `mcp${n}`, url, ...(await size(url)), name: r.ref.filename, ref: r.ref };
}

async function toRefs(list: McpRef[] = []): Promise<JobRefs> {
  const refs = await Promise.all(list.map(toRef));
  const of = (role: Role) => refs.filter((_, n) => list[n].role === role);
  return { images: of('image'), style: of('style'), character: of('character'), start: of('start')[0], end: of('end')[0] };
}

/** Runs an action; when it makes no job, the error it showed is the answer. */
function started(run: () => Job[]): string[] {
  const seen = getState().toasts.at(-1)?.id ?? 0;
  const jobs = run();
  if (!jobs.length) throw new Error(getState().toasts.filter((t) => t.id > seen && t.kind === 'error').map((t) => t.text).join(' ') || 'Nothing was run.');
  return jobs.map((j) => j.id);
}

const commands: Record<string, (args: Record<string, unknown>) => unknown> = {
  jobs: () => getState().jobs,
  imagine: async (a) => {
    const refs = await toRefs(a.references as McpRef[]);
    return started(() => imagine(String(a.prompt ?? ''), refs, { output: 'image', ...(a.grid ? { grid: a.grid as 1 | 2 | 3 | 4 } : {}) }));
  },
  act: (a) => {
    const action = a.action as ActionKind;
    if (!ACTIONS.includes(action)) throw new Error(`Unknown action ${action}.`);
    const { job } = jobImage(String(a.job), Number(a.index ?? 0));
    // Animate drops the image parameters of the source prompt, as the lightbox does.
    const prompt = (a.prompt as string | undefined) ?? (action === 'animate' ? job.prompt : undefined);
    return started(() =>
      runAction(action, {
        source: { jobId: job.id, index: Number(a.index ?? 0) },
        prompt,
        strength: a.strength as 'subtle' | 'strong' | undefined,
        zoom: a.zoom as number | undefined,
        factor: a.factor as 2 | 4 | undefined,
        pan: a.pan as PanDir | undefined,
        motion: a.motion as Motion | undefined,
        refs: a.loop ? { loop: true } : undefined,
      }),
    );
  },
  cancel: (a) => {
    if (!getState().jobs.some((j) => j.id === a.job)) throw new Error(`No job ${a.job}.`);
    cancelJob(String(a.job));
    return 'cancelled';
  },
};

async function answer(cmd: { id: number; command: string; args: Record<string, unknown> }) {
  let reply: { id: number; result?: unknown; error?: string };
  try {
    if (!commands[cmd.command]) throw new Error(`Unknown command ${cmd.command}.`);
    reply = { id: cmd.id, result: await commands[cmd.command](cmd.args) };
  } catch (e) {
    reply = { id: cmd.id, error: e instanceof Error ? e.message : String(e) };
  }
  await fetch('/lumen/mcp/result', { method: 'POST', body: JSON.stringify(reply) });
}

export async function listenToMcp() {
  for (;;) {
    try {
      const res = await fetch('/lumen/mcp/next');
      if (res.status === 200) void answer(await res.json());
      else if (res.status !== 204) throw new Error(String(res.status));
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
