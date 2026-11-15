// Built-in ComfyUI workflows (API format) for each action, and the code that
// fills a workflow — built-in or the person's own — with the job's inputs.
import type { ActionKind, JobInputs, PanDir } from './types';
import PE_TASK from './h3_edit_task_prompt.txt?raw';
import { getConfig, type ComfyConfig } from './config';
import { comboOptions } from './client';

export type ApiWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>;

/* ------------------------------------------------------------------ */
/* Built-in workflows                                                  */
/* ------------------------------------------------------------------ */

type Link = [string, number];

type Graph = ReturnType<typeof graph>;

function graph() {
  const wf: ApiWorkflow = {};
  const add = (class_type: string, inputs: Record<string, unknown>, title?: string): Link => {
    const id = String(Object.keys(wf).length + 1);
    wf[id] = title ? { class_type, inputs, _meta: { title } } : { class_type, inputs };
    return [id, 0];
  };
  return { wf, add };
}

const out = (link: Link, n: number): Link => [link[0], n];
const pictureLabels = (from: number, count: number) => Array.from({ length: count }, (_, n) => `<Picture ${from + n}>`).join(' and ');

/** What H3 Image is asked, by action. The pictures follow in the order image prompts, style references. */
function h3Prompt(i: JobInputs): string {
  const images = i.images?.length ?? 0;
  const characters = i.character_images?.length ?? 0;
  const styles = i.style_images?.length ?? 0;
  const imageLabels = pictureLabels(1, images);
  const characterLabels = pictureLabels(images + 1, characters);
  // --iw: how closely the image prompts are followed.
  const iw = i.image_weight ?? 1;
  const imageRole =
    iw < 0.5
      ? `Take only loose inspiration from ${imageLabels}: its general mood, colors and subject matter; the composition and details follow the prompt.`
      : iw > 1.5
        ? `Follow ${imageLabels} closely: keep its subject, composition, colors and details as much as the prompt allows.`
        : `Use ${imageLabels} as the reference for the subject, composition and colors.`;
  // --cw: how much of the character is kept, from the face only to face, hair, body and outfit.
  const cw = i.character_weight ?? 100;
  const kept = cw <= 30 ? 'only their face' : cw <= 70 ? 'their face, hair and build' : 'their face, hair, body and outfit exactly';
  const characterRole = `The character in ${characterLabels}${characters > 1 ? ' (the same person in every picture)' : ''} is the main character: keep ${kept}, in the pose, action and scene the prompt describes; do not copy the pose, framing or background of the picture${characters > 1 ? 's' : ''}.`;
  return [
    i.prompt,
    images && !i.prompt.includes('<Picture') && imageRole,
    characters && characterRole,
    styles && `Draw the whole image in the art style of ${pictureLabels(images + characters + 1, styles)}: take only its rendering, line work, shading and colors, not its subject, pose or content.`,
  ].filter(Boolean).join('\n\n');
}

/* Zoom out, Pan, the Editor and new images with reference pictures go through MiniMax's edit prompt enhancer (the task
   prompt of MiniMax-H3-Image-PE, as in ComfyUI's H3 Image edit template): H3 Image was trained on its captions. It only
   redraws the framing when the caption says how small the picture now is and what newly appears around it, and it takes
   the role of each reference (subject, style) from the caption rather than from a fixed sentence. */
const PE_SYSTEM =
  'Reason in the thinking section first. The visible final content must be exactly one JSON object with exactly two keys: expanded_caption and aspect_ratio. Every ASCII double quotation mark used as caption content inside expanded_caption must be serialized as the JSON escape sequence \\". Do not output text outside that object.';
const NEWLY_VISIBLE = 'Describe concretely what newly becomes visible around it on every side (for a person: the rest of the head, the neck, shoulders, body and clothing; for a place: more of the ground, sky, walls and surroundings), and state how small the main subject now is in the frame.';
const SIDE: Record<PanDir, string> = { left: 'left', right: 'right', up: 'top', down: 'bottom' };

function fillInstruction(i: JobInputs): string {
  if (i.action === 'retexture') {
    // Keeps the structure, as with the 3D blockout tests: H3 Image keeps camera and places when told to.
    const look = [i.prompt, ...i.concepts.map((c) => c.text)].filter(Boolean).join(' ');
    return `Retexture <Picture 1>: keep its composition, camera angle, perspective and the shape, size and place of every person and object exactly as they are, and redraw all of its surfaces, materials, colors, lighting and rendering so that the whole image becomes: ${look}. Describe concretely the new look of each element.`;
  }
  if (i.action === 'edit') {
    // The Editor's canvas was flattened on white: H3 Image reads transparency as black.
    return [
      'The plain white areas of <Picture 1> were erased or are new empty canvas. Fill them so the picture continues seamlessly in its perspective, lighting and art style, keeping everything else exactly as it is, with no white areas or borders left. Describe concretely what fills the white areas.',
      (i.prompt || i.concepts.length) && `The finished image shows: ${[i.prompt, ...i.concepts.map((c) => c.text)].filter(Boolean).join(' ')}`,
    ].filter(Boolean).join(' ');
  }
  if (i.action === 'pan') {
    const side = SIDE[i.pan ?? 'right'];
    return `The ${side} third of <Picture 1> is a blank white area. Fill it by continuing the scene past the ${side} edge of the picture, keeping everything else exactly as it is. Describe concretely what newly becomes visible there.`;
  }
  const f = i.zoom ?? 2;
  const size = f === 2 ? 'half size' : f === 1.5 ? 'two thirds of its size' : `${Math.round(100 / f)}% of its size`;
  const far = f === 2 ? 'twice' : `${f} times`;
  return `<Picture 1> is a picture shrunk to ${size} in the middle of a white canvas. Fill the white border by continuing the scene outward, so the result is the same scene seen from ${far} as far away. ${NEWLY_VISIBLE}`;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const ratio = (w: number, h: number) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;

/** The enhancer's user message: the pictures with their ratios, the instruction and the canvas ratio, as its task prompt describes. */
function peRequest(i: JobInputs, count: number): string {
  const r = ratio(i.width, i.height);
  const own = ON_SOURCE.includes(i.action);
  // The image being edited has the ratio of the result; reference pictures their own.
  const ratios = own ? [r] : (i.picture_ratios ?? []);
  return [
    `Reference Image Count: ${count} input image(s), labeled <Picture 1> through <Picture ${count}>.`,
    `Reference Media:\n${Array.from({ length: count }, (_, n) => `- <Picture ${n + 1}> [${ratios[n] ? `aspect_ratio ${ratios[n]}` : 'aspect_ratio unavailable'}]`).join('\n')}`,
    `User Editing Instruction (JSON string): ${JSON.stringify(own ? fillInstruction(i) : h3Prompt(i))}`,
    `User Aspect Ratio Selection: ${r}`,
    'Apply the instructions above to the supplied inputs and reference images. Output only the required two-field JSON object.',
  ].join('\n');
}

/** First step of the sigma schedule at or below the denoise strength, so img2img starts there. */
function startStep(sigmas: string, denoise: number) {
  const list = sigmas.split(',').map(Number);
  const step = list.findIndex((s) => s <= denoise + 0.005);
  return Math.min(Math.max(step, 1), list.length - 2);
}

const IMG2IMG: ActionKind[] = ['vary_subtle', 'vary_strong', 'remix', 'upscale_subtle', 'upscale_creative'];
const FILL: ActionKind[] = ['edit', 'zoom_out', 'pan'];
/** Edits whose only picture is the image itself, as <Picture 1>. */
const ON_SOURCE: ActionKind[] = [...FILL, 'retexture'];

const STYLE_NODE = { h3: 'MiniMaxH3StyleCode', moss: 'MOSSStyleCode', anima: 'AnimaStyleCode' } as const;
const GENERATION: ActionKind[] = ['imagine', 'image_prompt'];

/** Built-in H3 jobs whose caption the edit prompt enhancer writes: the fill edits, and new images with reference pictures. */
export const enhanced = (i: JobInputs) =>
  i.engine === 'h3' && (ON_SOURCE.includes(i.action) || (GENERATION.includes(i.action) && (i.images?.length ?? 0) + (i.character_images?.length ?? 0) + (i.style_images?.length ?? 0) > 0));

/** --sref codes ("123 456::0.5") through the engine's Style Code node, only on new images: edits keep the source's look.
    --sw 100 is the node's default strength 1.5. The styles it picked come back as the run's text. */
function styleCode(add: Graph['add'], i: JobInputs, model: Link, clip: Link, s: ComfyConfig['styleCodes']): Link {
  const codes = (i.sref ?? '').split(/[\s,]+/).filter((t) => /^\d+(::-?\d*\.?\d+)?$/.test(t));
  if (!codes.length || !GENERATION.includes(i.action)) return model;
  const [first, ...mix] = codes;
  const styled = add(STYLE_NODE[i.engine], {
    model,
    clip,
    code: Number(first.split('::')[0]),
    mix: mix.join(', '),
    strength: Math.min(4, (1.5 * (i.style_weight ?? 100)) / 100),
    bypass: false,
    ...(i.engine === 'anima'
      ? { styles_per_code: s.animaStyles, artists_per_code: s.animaArtists, artist_pool: 5000 }
      : { styles_per_code: s.styles }),
    ...(i.engine === 'h3' ? { max_strength: 4 } : {}),
  });
  add('PreviewAny', { source: out(styled, 1) }, 'styles');
  return styled;
}

const SLIDER_NODE = { h3: 'MiniMaxH3ConceptSlider', moss: 'MOSSConceptSlider', anima: 'AnimaTagSlider' } as const;
/** MOSS's and Anima's sliders stop at 1.5; H3's range follows max_strength. */
const SLIDER_MAX = { h3: Infinity, moss: 1.5, anima: 1.5 } as const;

/** Weighted prompt segments (a::2) as one concept slider each, chained like LoRAs: 1 is the segment as written. */
function conceptSliders(add: Graph['add'], i: JobInputs, model: Link, clip: Link, mode: ComfyConfig['conceptMode']): Link {
  for (const { text, weight } of i.concepts) {
    const strength = Math.min(weight, SLIDER_MAX[i.engine]);
    const words = i.engine === 'anima' ? { tag_low: '', tag_high: text } : { concept_low: '', concept_high: text };
    model = add(SLIDER_NODE[i.engine], { model, clip, ...words, mode, strength, bypass: false, ...(i.engine === 'h3' ? { max_strength: Math.max(1.5, strength) } : {}) });
  }
  return model;
}

function h3Workflow(i: JobInputs, c: ComfyConfig['h3'], styles: ComfyConfig['styleCodes'], mode: ComfyConfig['conceptMode']): ApiWorkflow {
  const { wf, add } = graph();
  const clip = add('CLIPLoader', { clip_name: c.clip, type: 'minimax', device: 'default' });
  const model = conceptSliders(add, i, styleCode(add, i, add('UNETLoader', { unet_name: c.unet, weight_dtype: 'default' }), clip, styles), clip, mode);
  const vae = add('VAELoader', { vae_name: c.vae });
  const files = ON_SOURCE.includes(i.action) ? [i.image ?? ''] : [...(i.images ?? []), ...(i.character_images ?? []), ...(i.style_images ?? [])];
  const pictures = Object.fromEntries(files.map((image, n) => [`images.image_${n + 1}`, add('LoadImage', { image })]));
  let prompt: string | Link = i.caption ?? h3Prompt(i);
  if (enhanced(i) && !i.caption) {
    const caption = add('TextGenerateV2', {
      clip: add('CLIPLoader', { clip_name: c.peClip, type: 'minimax', device: 'default' }),
      ...Object.fromEntries(Object.values(pictures).map((link, n) => [`images.image${n + 1}`, link])),
      system_prompt: `${PE_TASK}\n${PE_SYSTEM}`,
      prompt: peRequest(i, files.length),
      max_length: 8196,
      sampling_mode: 'on',
      'sampling_mode.temperature': 1,
      'sampling_mode.top_k': 20,
      'sampling_mode.top_p': 0.95,
      'sampling_mode.min_p': 0,
      'sampling_mode.repetition_penalty': 1,
      // 0 (the template's value) lets the w4a8 9B loop in its thinking until max_length and answer nothing.
      'sampling_mode.presence_penalty': 1.5,
      'sampling_mode.seed': i.seed,
      thinking: true,
      use_default_template: true,
      mtp: 'auto',
    });
    prompt = add('JsonExtractString', { json_string: caption, key: 'expanded_caption' });
    // The caption comes back as the run's text, so an empty one can be reported instead of shown as a copy of the canvas.
    add('PreviewAny', { source: prompt }, 'caption');
  }
  const conditioning = add('MiniMaxH3ImageConditioning', { clip, vae, prompt, width: i.width, height: i.height, ...pictures });
  let sigmas = add('ManualSigmas', { sigmas: c.sigmas });
  let latent = out(conditioning, 1);
  if (IMG2IMG.includes(i.action)) {
    // Vary, Remix and Upscale redraw the image from a later step, at the size asked for.
    const pixels = add('ImageScale', { image: add('LoadImage', { image: i.image ?? '' }), upscale_method: 'lanczos', width: i.width, height: i.height, crop: 'center' });
    latent = add('VAEEncode', { pixels, vae });
    sigmas = out(add('SplitSigmas', { sigmas, step: startStep(c.sigmas, i.denoise) }), 1);
  }
  const sampled = add('SamplerCustomAdvanced', {
    noise: add('RandomNoise', { noise_seed: i.seed }),
    guider: add('BasicGuider', { model, conditioning }),
    sampler: add('SamplerLCM', { s_noise: c.sNoise, s_noise_end: c.sNoiseEnd, noise_clip_std: 0 }),
    sigmas,
    latent_image: latent,
  });
  add('SaveImage', { images: add('VAEDecode', { samples: sampled, vae }), filename_prefix: `lumen/${i.action}` });
  return wf;
}

const DESCRIBE_SYSTEM = `You write prompts for MiniMax H3 Image, a text-to-image model. Look at the picture and write four different prompts that would make a picture like it.
Each prompt is one paragraph of plain, natural English of 40 to 80 words. Start with the kind of image (a photograph, an anime illustration, an oil painting, a 3D render…), then the subject and how it looks, what it is doing, the setting, the framing and camera angle, the light and its direction, and the style and colors.
Make the four different: the first describes the picture closely, the second leads with its style and mood, the third with its composition and camera, the fourth is short and simple.
No lists of tags, no quality or hype words (masterpiece, best quality, 8k, stunning), no names of real people.
Output only the four prompts, numbered 1. to 4., one per line.`;

/** Describe: four prompts for the picture, written by the enhancer's encoder. */
function describeWorkflow(i: JobInputs, clipName: string): ApiWorkflow {
  const { wf, add } = graph();
  const text = add('TextGenerateV2', {
    clip: add('CLIPLoader', { clip_name: clipName, type: 'minimax', device: 'default' }),
    'images.image1': add('LoadImage', { image: i.image ?? '' }),
    system_prompt: DESCRIBE_SYSTEM,
    prompt: 'Write the four prompts for this picture.',
    max_length: 2048,
    sampling_mode: 'on',
    'sampling_mode.temperature': 0.8,
    'sampling_mode.top_k': 20,
    'sampling_mode.top_p': 0.95,
    'sampling_mode.min_p': 0,
    'sampling_mode.repetition_penalty': 1,
    'sampling_mode.presence_penalty': 1.5,
    'sampling_mode.seed': i.seed,
    thinking: false,
    use_default_template: true,
    mtp: 'auto',
  });
  add('PreviewAny', { source: text }, 'describe');
  return wf;
}

/** Anima and MOSS Image with their turbo LoRAs: text to image only. */
function textToImage(i: JobInputs, engine: 'anima' | 'moss', c: ComfyConfig): ApiWorkflow {
  const { wf, add } = graph();
  const e = c[engine];
  let model = add('UNETLoader', { unet_name: e.unet, weight_dtype: 'default' });
  if (e.lora) model = add('LoraLoaderModelOnly', { model, lora_name: e.lora, strength_model: 1 });
  const clip = add('CLIPLoader', { clip_name: e.clip, type: engine === 'anima' ? 'stable_diffusion' : 'moss_image', device: 'default' });
  const vae = add('VAELoader', { vae_name: e.vae });
  if (engine === 'anima' && i.character_images?.length) {
    // --cref on Anima: SnapRef with up to three pictures of the character; --cw is its fidelity.
    const [first, ...more] = i.character_images.slice(0, 3).map((image) => add('LoadImage', { image }));
    model = add('SnapRef', {
      model,
      clip,
      vae,
      image: first,
      ...Object.fromEntries(more.map((link, n) => [`image_${n + 2}`, link])),
      adapter: c.anima.snapref,
      mode: c.anima.snaprefMode,
      ref_in_uncond: false,
      ref_megapixels: 1,
      strength: 0,
      ref_caption: '',
      ref_guidance_on: false,
      ref_guidance: 4.5,
      correction: 'apg',
      ref_end: 1,
      use_batch: false,
      multi_layout: 'separate',
      weight_1: 1,
      weight_2: 1,
      weight_3: 1,
      fidelity: (i.character_weight ?? 100) / 100,
    });
  }
  model = conceptSliders(add, i, styleCode(add, i, model, clip, c.styleCodes), clip, c.conceptMode);
  const latent = add(engine === 'anima' ? 'EmptyLatentImage' : 'EmptyFlux2LatentImage', { width: i.width, height: i.height, batch_size: 1 });
  const sampled = add('KSampler', {
    model,
    positive: add('CLIPTextEncode', { clip, text: i.prompt }),
    negative: add('CLIPTextEncode', { clip, text: e.negative }),
    latent_image: latent,
    seed: i.seed,
    steps: e.steps,
    cfg: e.cfg,
    sampler_name: e.sampler,
    scheduler: e.scheduler,
    denoise: 1,
  });
  add('SaveImage', { images: add('VAEDecode', { samples: sampled, vae }), filename_prefix: `lumen/${engine}` });
  return wf;
}

export function builtInWorkflow(i: JobInputs): ApiWorkflow {
  switch (i.action) {
    case 'video':
    case 'animate':
    case 'extend':
      throw new Error('Aún no hay workflow de vídeo integrado: añade uno propio en la página ComfyUI.');
    case 'converse':
      throw new Error('El modo conversacional con ComfyUI necesita un workflow propio con un LLM que devuelva texto.');
  }
  const c = getConfig();
  if (i.action === 'describe') return describeWorkflow(i, c.h3.peClip);
  return i.engine === 'h3' ? h3Workflow(i, c.h3, c.styleCodes, c.conceptMode) : textToImage(i, i.engine, c);
}

/** Loader inputs whose files must be on the server; ComfyUI's own error lists every file it has. */
const MODEL_INPUTS = ['unet_name', 'clip_name', 'vae_name', 'lora_name', 'ckpt_name'];

/** Clear errors for a missing node or model before the workflow is sent. */
export function checkWorkflow(wf: ApiWorkflow, defs: Record<string, unknown>) {
  for (const node of Object.values(wf)) {
    if (!defs[node.class_type]) throw new Error(`Falta el nodo ${node.class_type} en ComfyUI. Instala o activa el pack que lo trae.`);
    for (const key of MODEL_INPUTS) {
      const value = node.inputs[key];
      if (typeof value !== 'string') continue;
      const options = comboOptions(defs as Parameters<typeof comboOptions>[0], node.class_type, key);
      if (!options.includes(value)) throw new Error(`No encuentro el modelo «${value}» (${node.class_type}). Elígelo en la página ComfyUI.`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Filling a custom workflow                                           */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Replace {{prompt}}, {{seed}}, {{width}}… anywhere in the workflow. Returns how many were found. */
function replacePlaceholders(wf: ApiWorkflow, i: JobInputs): number {
  const values = i as unknown as Record<string, unknown>;
  let count = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = v.match(/^\{\{\s*([a-z_]+)\s*\}\}$/);
      if (whole && whole[1] in values) {
        count++;
        return values[whole[1]];
      }
      return v.replace(PLACEHOLDER, (m, k: string) => {
        if (!(k in values)) return m;
        count++;
        return String(values[k] ?? '');
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) o[k] = walk(o[k]);
      return o;
    }
    return v;
  };
  walk(wf);
  return count;
}

const SAMPLERS = ['KSampler', 'KSamplerAdvanced', 'SamplerCustom', 'SamplerCustomAdvanced'];
const LATENTS = ['EmptyLatentImage', 'EmptySD3LatentImage', 'EmptyHunyuanLatentVideo', 'EmptyMochiLatentVideo'];
const VIDEO_LATENTS = ['WanImageToVideo', 'WanFunInpaintToVideo', 'Wan22ImageToVideoLatent', 'EmptyLTXVLatentVideo', 'LTXVImgToVideo', 'EmptyCosmosLatentVideo', 'HunyuanImageToVideo'];
const TEXT_NODES = ['CLIPTextEncode', 'CLIPTextEncodeSDXL', 'CLIPTextEncodeFlux'];

function linked(wf: ApiWorkflow, v: unknown) {
  return Array.isArray(v) && typeof v[0] === 'string' ? wf[v[0]] : undefined;
}

/** Follow a link backwards (through conditioning helpers) until a text encoder is found. */
function findTextNode(wf: ApiWorkflow, v: unknown, depth = 0): ApiWorkflow[string] | undefined {
  const n = linked(wf, v);
  if (!n || depth > 6) return undefined;
  if (TEXT_NODES.includes(n.class_type)) return n;
  for (const key of ['conditioning', 'conditioning_to', 'conditioning_1', 'positive', 'guider']) {
    const found = findTextNode(wf, n.inputs[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function setText(node: ApiWorkflow[string] | undefined, text: string) {
  if (!node) return;
  for (const k of ['text', 'clip_l', 't5xxl', 'text_g', 'text_l']) if (k in node.inputs && typeof node.inputs[k] === 'string') node.inputs[k] = text;
}

/** For workflows without placeholders: find the usual nodes and set their fields. */
function autoFill(wf: ApiWorkflow, i: JobInputs) {
  for (const node of Object.values(wf)) {
    const inp = node.inputs;
    if (SAMPLERS.includes(node.class_type) || node.class_type === 'CFGGuider' || node.class_type === 'BasicGuider') {
      if ('seed' in inp && !Array.isArray(inp.seed)) inp.seed = i.seed;
      if ('noise_seed' in inp && !Array.isArray(inp.noise_seed)) inp.noise_seed = i.seed;
      if (node.class_type === 'KSampler' && i.action !== 'imagine') inp.denoise = i.denoise;
      setText(findTextNode(wf, inp.positive), i.motion_prompt ?? i.prompt);
      setText(findTextNode(wf, inp.conditioning), i.motion_prompt ?? i.prompt);
    }
    if (node.class_type === 'RandomNoise' && !Array.isArray(inp.noise_seed)) inp.noise_seed = i.seed;
    if (LATENTS.includes(node.class_type) || VIDEO_LATENTS.includes(node.class_type)) {
      if (!Array.isArray(inp.width)) inp.width = i.width;
      if (!Array.isArray(inp.height)) inp.height = i.height;
      if ('batch_size' in inp && !Array.isArray(inp.batch_size)) inp.batch_size = i.batch;
      if ('length' in inp && i.frames && !Array.isArray(inp.length)) inp.length = i.frames;
    }
    if (/^Save(Animated|Video|WEBM)/.test(node.class_type) && 'fps' in inp && i.fps && !Array.isArray(inp.fps)) inp.fps = i.fps;
    if (node.class_type === 'VHS_VideoCombine' && i.fps && !Array.isArray(inp.frame_rate)) inp.frame_rate = i.fps;
    if (node.class_type === 'LoadImage') {
      // Nodes titled "style/estilo" or "end/final" get those images; the rest get the main image.
      const title = (node._meta?.title ?? '').toLowerCase();
      if (/style|estilo/.test(title)) {
        if (i.style_image) inp.image = i.style_image;
      } else if (/end|final|last|último/.test(title)) {
        const end = i.loop ? i.image : i.end_image;
        if (end) inp.image = end;
      } else if (i.image) inp.image = i.image;
    }
  }
}

export function parseWorkflow(json: string): ApiWorkflow {
  const data = JSON.parse(json);
  if (data && Array.isArray(data.nodes)) {
    throw new Error('Este JSON es el formato de la interfaz. En ComfyUI usa «Workflow → Export (API)» y pega ese archivo.');
  }
  if (!data || typeof data !== 'object') throw new Error('El workflow no es un objeto JSON.');
  return data as ApiWorkflow;
}

/** Build the final API payload for a job. */
export function buildWorkflow(i: JobInputs, custom?: string): { workflow: ApiWorkflow; source: 'custom' | 'built-in' } {
  if (custom && custom.trim()) {
    const wf = parseWorkflow(custom);
    const n = replacePlaceholders(wf, i);
    if (n === 0) autoFill(wf, i);
    return { workflow: wf, source: 'custom' };
  }
  return { workflow: builtInWorkflow(i), source: 'built-in' };
}

/** Placeholders a custom workflow may use. */
export const PLACEHOLDERS: { key: keyof JobInputs; desc: string }[] = [
  { key: 'prompt', desc: 'texto del prompt' },
  { key: 'concepts', desc: 'segmentos con peso (a::2), lista de {text, weight}' },
  { key: 'seed', desc: 'semilla' },
  { key: 'width', desc: 'ancho en px' },
  { key: 'height', desc: 'alto en px' },
  { key: 'batch', desc: 'imágenes por ejecución (1: el grid se hace en ejecuciones seguidas)' },
  { key: 'engine', desc: 'modelo pedido: h3, anima (--anima) o moss (--moss)' },
  { key: 'denoise', desc: 'fuerza de cambio (0–1)' },
  { key: 'image', desc: 'imagen de entrada (vary, upscale, zoom, pan)' },
  { key: 'chaos', desc: 'variedad 0–100' },
  { key: 'aspect', desc: 'relación de aspecto' },
  { key: 'pad_left', desc: 'relleno izq. (pan/zoom)' },
  { key: 'motion_prompt', desc: 'prompt + descripción del movimiento (vídeo)' },
  { key: 'motion', desc: 'movimiento: low / high (vídeo)' },
  { key: 'frames', desc: 'fotogramas del vídeo' },
  { key: 'fps', desc: 'fotogramas por segundo' },
  { key: 'end_image', desc: 'fotograma final (vídeo)' },
  { key: 'loop', desc: 'vídeo en bucle (true/false)' },
  { key: 'image_2', desc: '2.º prompt de imagen' },
  { key: 'images', desc: 'todos los prompts de imagen (lista)' },
  { key: 'style_images', desc: 'todas las referencias de estilo (lista)' },
  { key: 'image_weight', desc: 'peso de la imagen (--iw)' },
  { key: 'style_image', desc: 'primera referencia de estilo' },
  { key: 'style_weight', desc: 'peso del estilo (--sw)' },
  { key: 'sref', desc: 'código de estilo (--sref)' },
  { key: 'moodboard', desc: 'códigos de moodboard / perfil (--p)' },
  { key: 'message', desc: 'tu mensaje (modo conversacional)' },
  { key: 'current_prompt', desc: 'el prompt actual (modo conversacional)' },
  { key: 'hd', desc: 'alta resolución (true/false)' },
  { key: 'tile', desc: 'patrón repetible (--tile)' },
];

export const ACTION_ORDER: ActionKind[] = [
  'imagine',
  'image_prompt',
  'vary_subtle',
  'vary_strong',
  'upscale_subtle',
  'upscale_creative',
  'remix',
  'zoom_out',
  'pan',
  'edit',
  'retexture',
  'video',
  'animate',
  'extend',
  'describe',
  'converse',
];
