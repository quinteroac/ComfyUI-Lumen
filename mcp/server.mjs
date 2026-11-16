// Lumen MCP server over stdio. It only talks to the local ComfyUI server in LUMEN_URL.
// Reading jobs and images works with Lumen closed; creating asks the open Lumen page to run the action as its buttons do.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import readline from 'node:readline';

const base = (process.env.LUMEN_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const ACTIONS = ['vary_subtle', 'vary_strong', 'upscale_subtle', 'upscale_creative', 'remix', 'zoom_out', 'pan', 'retexture', 'animate', 'extend', 'upscale_video', 'describe'];
const BUSY = ['queued', 'running'];

async function request(path, init) {
    const response = await fetch(`${base}${path}`, init);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw Object.assign(new Error(data.error?.message || data.error || `ComfyUI answered ${response.status} for ${path}`), { status: response.status });
    }
    return response;
}

/** A command for the open Lumen page. */
async function page(command, args = {}) {
    const response = await request('/lumen/mcp/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, args }) });
    return (await response.json()).result;
}

/** Lumen's jobs: live from the page when it is open, else as last saved. */
async function jobs() {
    try { return await page('jobs'); }
    catch (error) {
        if (error.status !== 503) throw error;
        const response = await fetch(`${base}/api/userdata/${encodeURIComponent('lumen/state.json')}`);
        return response.ok ? (await response.json()).jobs ?? [] : [];
    }
}

const file = ref => ref && (ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename);
const summary = job => ({
    id: job.id, action: job.action, status: job.status, progress: Math.round((job.progress ?? 0) * 100) / 100, message: job.message,
    prompt: job.rawPrompt, created: new Date(job.createdAt).toISOString(), parent: job.parent,
    size: `${job.inputs?.width}x${job.inputs?.height}`, engine: job.inputs?.engine, seed: job.inputs?.seed,
    images: (job.images ?? []).map((im, index) => ({ index, kind: im.kind ?? 'image', width: im.w, height: im.h, file: file(im.ref), liked: !!im.liked, trashed: !!im.trashed, extended: im.extended })),
    ...(job.texts ? { texts: job.texts } : {}), ...(job.inputs?.caption ? { caption: job.inputs.caption } : {}), ...(job.styleList ? { styles: job.styleList.split('\n') } : {}),
});

async function findJob(id) {
    const job = (await jobs()).find(j => j.id === id);
    if (!job) throw new Error(`No job ${id}. Use list_jobs.`);
    return job;
}

/** Waits until the jobs leave the queue, or the timeout passes. */
async function finished(ids, wait, timeout) {
    const deadline = Date.now() + timeout * 1000;
    for (;;) {
        const made = (await jobs()).filter(j => ids.includes(j.id));
        if (!wait || made.every(j => !BUSY.includes(j.status)) || Date.now() > deadline) {
            const out = made.map(summary);
            return made.some(j => BUSY.includes(j.status)) ? { jobs: out, note: 'Still running: call get_job later.' } : { jobs: out };
        }
        await new Promise(r => setTimeout(r, 3000));
    }
}

/** Local files go to ComfyUI's input folder; Lumen images are passed by job and index. */
async function references(list = []) {
    return Promise.all(list.map(async r => {
        if (r.job) return { role: r.role, job: r.job, index: r.index ?? 0 };
        if (!r.path) throw new Error('A reference needs job (and index) or path.');
        const form = new FormData();
        form.append('image', new Blob([await readFile(r.path)]), `lumen_mcp_${basename(r.path)}`);
        form.append('overwrite', 'true');
        const up = await (await request('/upload/image', { method: 'POST', body: form })).json();
        return { role: r.role, ref: { filename: up.name, subfolder: up.subfolder ?? '', type: up.type ?? 'input' } };
    }));
}

const text = value => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
const input = (properties = {}, required = []) => ({ type: 'object', properties, required });
const read = { readOnlyHint: true, openWorldHint: false };
const create = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const jobInput = { type: 'string', description: 'Job id from list_jobs' };
const waiting = {
    wait: { type: 'boolean', default: true, description: 'Wait until the jobs finish (videos take 3-4 minutes each)' },
    timeout: { type: 'number', default: 600, description: 'Seconds to wait at most' },
};

const tools = {
    list_jobs: { description: 'List Lumen jobs, newest first, with their status, prompt and images.', annotations: read,
        inputSchema: input({ limit: { type: 'number', default: 20 }, status: { type: 'string', enum: ['queued', 'running', 'done', 'error', 'cancelled'] } }),
        run: async ({ limit = 20, status }) => text((await jobs()).filter(j => !status || j.status === status).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(summary)) },
    get_job: { description: 'One job: status, progress, prompt, the enhancer caption, styles, Describe texts and images.', annotations: read,
        inputSchema: input({ job: jobInput }, ['job']), run: async ({ job }) => text(summary(await findJob(job))) },
    view_image: { description: 'A JPEG preview of a job image (size = longest side). Videos come as four frames in a 2x2 grid, in order.', annotations: read,
        inputSchema: input({ job: jobInput, index: { type: 'number', default: 0 }, size: { type: 'number', default: 768 } }, ['job']),
        run: async ({ job, index = 0, size = 768 }) => {
            const img = (await findJob(job)).images?.[index];
            if (!img?.ref) throw new Error(`Job ${job} has no image ${index} in ComfyUI.`);
            const q = new URLSearchParams({ filename: img.ref.filename, subfolder: img.ref.subfolder ?? '', type: img.ref.type ?? 'output', size: String(size) });
            const response = await request(`/lumen/mcp/thumb?${q}`);
            return [{ type: 'image', data: Buffer.from(await response.arrayBuffer()).toString('base64'), mimeType: 'image/jpeg' }];
        } },
    imagine: { description: 'Create images or a video from a prompt, as the imagine bar does. The prompt takes Lumen\'s parameters: --ar W:H, --draft, --hd, --c 0-100, --seed N, --r N, --sref CODE[::weight] / random, --sw, --cw, --iw, --anima, --moss, --video with --motion low|high and --loop, multi-prompts a::2 b::0.5 and permutations {a, b}. References: image (image prompt), style, character (--cref), start and end frames (a start frame makes Animate); with references, --video uses them as Ref2VA references (up to 9).',
        annotations: create,
        inputSchema: input({
            prompt: { type: 'string' },
            references: { type: 'array', items: input({ role: { type: 'string', enum: ['image', 'style', 'character', 'start', 'end'] }, job: jobInput, index: { type: 'number' }, path: { type: 'string', description: 'A local image file instead of a Lumen image' } }, ['role']) },
            grid: { type: 'number', enum: [1, 2, 3, 4], description: 'Images per prompt; default the bar\'s setting' },
            ...waiting,
        }, ['prompt']),
        run: async ({ prompt, references: refs, grid, wait = true, timeout = 600 }) =>
            text(await finished(await page('imagine', { prompt, references: await references(refs), grid }), wait, timeout)) },
    act: { description: 'Run an action on a job image, as its buttons do: vary_subtle, vary_strong, upscale_subtle, upscale_creative (16 MP), remix (prompt, strength), zoom_out (zoom 1.5 or 2), pan (left/right/up/down), retexture (prompt: the new look), animate (motion, loop, prompt), extend (a Lumen video, up to 4 times), upscale_video (factor 2: RelayVSR, 4: ReCaVSR) and describe (four prompts).',
        annotations: create,
        inputSchema: input({
            job: jobInput, index: { type: 'number', default: 0 }, action: { type: 'string', enum: ACTIONS },
            prompt: { type: 'string', description: 'Prompt instead of the source\'s (remix, retexture, animate, extend)' },
            strength: { type: 'string', enum: ['subtle', 'strong'] }, zoom: { type: 'number', enum: [1.5, 2] }, factor: { type: 'number', enum: [2, 4], description: 'upscale_video: 2 (default) or 4' }, pan: { type: 'string', enum: ['left', 'right', 'up', 'down'] },
            motion: { type: 'string', enum: ['low', 'high'] }, loop: { type: 'boolean' },
            ...waiting,
        }, ['job', 'action']),
        run: async ({ wait = true, timeout = 600, ...args }) => text(await finished(await page('act', args), wait, timeout)) },
    cancel_job: { description: 'Cancel a queued or running job.', annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        inputSchema: input({ job: jobInput }, ['job']), run: async ({ job }) => text(await page('cancel', { job })) },
};

const handlers = {
    initialize: params => ({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'lumen', version: '1.0.0' },
        instructions: 'Tools for Lumen, the image and video studio of the local ComfyUI (MiniMax H3 Image and Video, Anima, MOSS Image). list_jobs, get_job and view_image work with Lumen closed; imagine, act and cancel_job need Lumen open in a browser, and their jobs appear in its Create page. Look at results with view_image before acting on them.' }),
    ping: () => ({}),
    'tools/list': () => ({ tools: Object.entries(tools).map(([name, { description, inputSchema, annotations }]) => ({ name, description, inputSchema, annotations })) }),
    'tools/call': async ({ name, arguments: args = {} }) => {
        if (!tools[name]) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
        try { return { content: await tools[name].run(args) }; }
        catch (error) { return { content: text(error.message === 'fetch failed' ? `ComfyUI is not reachable at ${base}. Start it or set LUMEN_URL.` : error.message), isError: true }; }
    },
};

readline.createInterface({ input: process.stdin }).on('line', async line => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); }
    if (message.id === undefined) return;
    const reply = { jsonrpc: '2.0', id: message.id };
    try {
        if (!handlers[message.method]) throw Object.assign(new Error(`Method not found: ${message.method}`), { code: -32601 });
        reply.result = await handlers[message.method](message.params || {});
    } catch (error) { reply.error = { code: error.code ?? -32603, message: error.message }; }
    process.stdout.write(JSON.stringify(reply) + '\n');
});
