// Built-in ComfyUI workflows (API format) for each action, and the code that
// fills a workflow — built-in or the person's own — with the job's inputs.
import type { ActionKind, JobInputs, PanDir } from './types';
import PE_TASK from './h3_edit_task_prompt.txt?raw';
import PE_T2I_TASK from './h3_t2i_task_prompt.txt?raw';
import VIDEO_GUIDE from './h3_video_guide.txt?raw';
import REF_VIDEO_GUIDE from './h3_video_ref_guide.txt?raw';
import { getConfig, type ComfyConfig } from './config';
import { comboOptions } from './client';
import { t } from '../i18n';

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

const COMMON_RATIOS = ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '1:2', '2:1', '9:21', '21:9'];

/** "2720x1536" → "16:9": the nearest common ratio within 1.5% of the shape (sizes are rounded to multiples of 32),
    else the simplest ratio within 1%. */
export function simpleRatio(w: number, h: number): string {
  if (!w || !h) return '';
  const off = (r: string) => {
    const [a, b] = r.split(':').map(Number);
    return Math.abs((a * h) / (b * w) - 1);
  };
  const common = COMMON_RATIOS.reduce((best, r) => (off(r) < off(best) ? r : best));
  if (off(common) < 0.015) return common;
  for (let b = 1; b <= 32; b++) {
    const a = Math.max(1, Math.round((w / h) * b));
    if (Math.abs((a * h) / (b * w) - 1) < 0.01) return `${a}:${b}`;
  }
  return `${Math.round((w / h) * 32)}:32`;
}

/** The enhancer's user message: the pictures with their ratios, the instruction and the canvas ratio, as its task prompt describes. */
function peRequest(i: JobInputs, count: number): string {
  const own = ON_SOURCE.includes(i.action);
  // New images keep the --ar the user chose; edits the shape of the result.
  const r = !own && i.aspect ? i.aspect : simpleRatio(i.width, i.height);
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

const STYLE_NODE = { h3: 'LumenH3StyleCode', moss: 'LumenMOSSStyleCode', anima: 'LumenAnimaStyleCode' } as const;
const GENERATION: ActionKind[] = ['imagine', 'image_prompt'];

/** Built-in H3 jobs whose caption an enhancer writes: videos, the fill edits, new images with reference pictures, and the others when the bar's option is on. */
export const enhanced = (i: JobInputs) =>
  i.action === 'video' || i.action === 'animate' || i.action === 'extend' ||
  (i.engine === 'h3' && (ON_SOURCE.includes(i.action) || (GENERATION.includes(i.action) && (!!i.enhance || (i.images?.length ?? 0) + (i.character_images?.length ?? 0) + (i.style_images?.length ?? 0) > 0))));

/** --sref codes ("123 456::0.5") through the engine's Style Code node, only on new images: edits keep the source's look.
    --sw 100 is the node's default strength 1.5. The styles it picked come back as the run's text. */
function styleCode(add: Graph['add'], i: JobInputs, model: Link, clip: Link, s: ComfyConfig['styleCodes']): Link {
  const codes = (i.sref ?? '').split(/[\s,]+/).filter((t) => /^\d+(::-?\d*\.?\d+)?$/.test(t));
  if (!codes.length || !GENERATION.includes(i.action)) return model;
  const styled = add(STYLE_NODE[i.engine], {
    model,
    clip,
    codes: codes.join(' '),
    strength: (1.5 * (i.style_weight ?? 100)) / 100,
    ...(i.engine === 'anima' ? { styles_per_code: s.animaStyles, artists_per_code: s.animaArtists } : { styles_per_code: s.styles }),
  });
  add('PreviewAny', { source: out(styled, 1) }, 'styles');
  return styled;
}

/** A model file as the user wrote it: a name without an extension is a .safetensors file. */
const modelFile = (name: string) => (/\.(safetensors|sft|ckpt|pt|pth|bin|gguf)$/i.test(name) ? name : `${name}.safetensors`);

/** The engine's diffusion model, or the --ck file; ComfyUI reports a file that doesn't fit the workflow. */
const unetName = (i: JobInputs, own: string) => (i.checkpoint ? modelFile(i.checkpoint) : own);

/** --lora on the image model, before style codes and sliders. */
function userLoras(add: Graph['add'], i: JobInputs, model: Link): Link {
  for (const { name, weight } of i.loras ?? []) model = add('LoraLoaderModelOnly', { model, lora_name: modelFile(name), strength_model: weight });
  return model;
}

const SLIDER_NODE = { h3: 'LumenH3ConceptSlider', moss: 'LumenMOSSConceptSlider', anima: 'LumenAnimaTagSlider' } as const;
/** --w per model: --w 1000 is where each one starts to multiply and rearrange the subject; Anima only stays clean in weight_norm. */
const WEIRD = { h3: { mode: 'attention', scale: 0.02 }, moss: { mode: 'attention', scale: 0.01 }, anima: { mode: 'weight_norm', scale: 0.004 } } as const;

/** Weighted prompt segments (a::2) as one concept slider each, chained like LoRAs: 1 is the segment as written. */
function conceptSliders(add: Graph['add'], i: JobInputs, model: Link, clip: Link, mode: ComfyConfig['conceptMode']): Link {
  for (const { text, weight } of i.concepts) {
    model = add(SLIDER_NODE[i.engine], { model, clip, [i.engine === 'anima' ? 'tag' : 'concept']: text, mode, strength: weight });
  }
  // --w: the whole prompt again as one more slider, only on new images.
  if (i.weird && i.prompt && GENERATION.includes(i.action)) {
    const { mode, scale } = WEIRD[i.engine];
    model = add(SLIDER_NODE[i.engine], { model, clip, [i.engine === 'anima' ? 'tag' : 'concept']: i.prompt, mode, strength: 1 + i.weird * scale });
  }
  return model;
}

function h3Workflow(i: JobInputs, c: ComfyConfig['h3'], styles: ComfyConfig['styleCodes'], mode: ComfyConfig['conceptMode']): ApiWorkflow {
  const { wf, add } = graph();
  const clip = add('CLIPLoader', { clip_name: c.clip, type: 'minimax', device: 'default' });
  const model = conceptSliders(add, i, styleCode(add, i, userLoras(add, i, add('UNETLoader', { unet_name: unetName(i, c.unet), weight_dtype: 'default' })), clip, styles), clip, mode);
  const vae = add('VAELoader', { vae_name: c.vae });
  const files = ON_SOURCE.includes(i.action) ? [i.image ?? ''] : [...(i.images ?? []), ...(i.character_images ?? []), ...(i.style_images ?? [])];
  const pictures = Object.fromEntries(files.map((image, n) => [`images.image_${n + 1}`, add('LoadImage', { image })]));
  let prompt: string | Link = i.caption ?? h3Prompt(i);
  if (enhanced(i) && !i.caption) {
    const caption = add('TextGenerateV2', {
      clip: add('CLIPLoader', { clip_name: c.peClip, type: 'minimax', device: 'default' }),
      ...Object.fromEntries(Object.values(pictures).map((link, n) => [`images.image${n + 1}`, link])),
      // Without pictures, the text-to-image task prompt of ComfyUI's H3 Image template, which keeps the ratio it is told.
      ...(files.length
        ? { system_prompt: `${PE_TASK}\n${PE_SYSTEM}`, prompt: peRequest(i, files.length) }
        : { system_prompt: PE_SYSTEM, prompt: PE_T2I_TASK.replace('{input text}', `${h3Prompt(i)} (aspect ratio ${i.aspect || simpleRatio(i.width, i.height)})`) }),
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

/* ------------------------------------------------------------------ */
/* Video: MiniMax H3 fl2va / ref2va with Pika Flex, its six sigmas and lcm, audio */
/* ------------------------------------------------------------------ */

/** The video enhancer's instructions: MiniMax's official H3 video prompt guide, then the answer it must give. */
const VIDEO_SYSTEM = `${VIDEO_GUIDE}

Write the final prompt for the request below following this guide. Output only the final prompt: the instruction line first when the mode has one, then a blank line and the three core fields. No headings, notes or code fences.`;

const REF_VIDEO_SYSTEM = `${REF_VIDEO_GUIDE}

Write the full-reference rewrite for the request below following this guide, with all six sections in order. Output only the rewrite: no headings beyond the section names, no notes or code fences.`;

/** T2VA without frames, I2VA with a first frame, FL2VA with a first and a last frame (a loop ends on its first frame). */
function videoRequest(i: JobInputs, frames: { first?: boolean; last?: boolean }): string {
  const seconds = (Math.ceil(((i.frames ?? 124) - 5) / 17) * 17 + 5) / 24;
  const mode = frames.first && frames.last ? 'FL2VA' : frames.first ? 'I2VA' : 'T2VA';
  return [
    i.action === 'extend' && CONTINUATION,
    `Mode: ${mode}${frames.first ? ' (<Picture 1> is the first frame' + (frames.last ? ', <Picture 2> the last frame' : '') + ')' : ''}${i.loop ? '. The video loops: the last frame is the first frame, so it must end exactly where it starts.' : ''}`,
    `Duration: ${seconds.toFixed(2)} seconds, one continuous shot unless the request asks for more.`,
    `Request: ${[i.prompt, ...i.concepts.map((c) => c.text)].filter(Boolean).join(' ') || 'Animate the picture naturally.'}`,
    i.motion_prompt && `Motion: ${i.motion_prompt}`,
  ].filter(Boolean).join('\n');
}

/** Extend keeps the last CONTEXT_FRAMES of the video as the new clip's fixed head (PrefixStream, Native Masked AV). */
const CONTEXT_FRAMES = 39;
const CONTINUATION = `This clip continues a video: its first ${(CONTEXT_FRAMES / 24).toFixed(2)} seconds are the end of the previous clip, starting at the frame shown as the first frame. Describe how the scene and its sound go on from there.`;

/** Ref2VA reads at most nine reference pictures. */
export const MAX_VIDEO_REFS = 9;

/** The video's reference pictures in <Picture n> order, each with the role the enhancer is told. */
function videoRefs(i: JobInputs): { file: string; role: string }[] {
  const cw = i.character_weight ?? 100;
  const kept = cw <= 30 ? 'their face' : cw <= 70 ? 'their face, hair and build' : 'their face, hair, body and outfit';
  return [
    ...(i.images ?? []).map((file) => ({ file, role: 'a reference for the subject, objects or setting' })),
    ...(i.character_images ?? []).map((file) => ({ file, role: `the main character: keep ${kept}` })),
    ...(i.style_images ?? []).map((file) => ({ file, role: 'the visual style only (rendering, line work, colors), not its content' })),
  ].slice(0, MAX_VIDEO_REFS);
}

/** The full-reference request: each picture's role, the fixed first or last frame when there is one, then the request. */
function refVideoRequest(i: JobInputs, refs: { role: string }[], frames: { first?: boolean; last?: boolean }): string {
  const seconds = (Math.ceil(((i.frames ?? 124) - 5) / 17) * 17 + 5) / 24;
  const n = refs.length;
  return [
    i.action === 'extend' && CONTINUATION,
    'Mode: full-reference video generation.',
    `There ${n === 1 ? 'is exactly 1 reference picture' : `are exactly ${n} reference pictures`}; name no other <Picture n>.`,
    ...refs.map((r, k) => `<Picture ${k + 1}> is ${r.role}.`),
    frames.first && `The attached picture after <Picture ${n}> is the fixed first frame of the video (0.00 seconds), not a reference.`,
    frames.last && `The last attached picture is the fixed final frame of the video (${seconds.toFixed(2)} seconds), not a reference.`,
    `Duration: ${seconds.toFixed(2)} seconds, one continuous shot unless the request asks for more.`,
    `Request: ${[i.prompt, ...i.concepts.map((c) => c.text)].filter(Boolean).join(' ') || 'A short scene with the referenced content.'}`,
    i.motion_prompt && `Motion: ${i.motion_prompt}`,
  ].filter(Boolean).join('\n');
}

function videoWorkflow(i: JobInputs, c: ComfyConfig): ApiWorkflow {
  const { wf, add } = graph();
  const v = c.video;
  const refs = videoRefs(i);
  const extend = i.action === 'extend';
  // With reference pictures, and to extend (as PrefixStream does): ref2va and its Pika LoRA; otherwise fl2va.
  const r2v = refs.length > 0 || extend;
  const model = add('MiniMaxH3SigmaShift', {
    model: add('LoraLoaderModelOnly', {
      model: add('UNETLoader', { unet_name: unetName(i, r2v ? v.ref2va : v.fl2va), weight_dtype: 'default' }),
      lora_name: r2v ? v.ref2vaLora : v.fl2vaLora,
      strength_model: 1,
    }),
    shift_video: 12,
    shift_audio: 3,
  });
  const clip = add('CLIPLoader', { clip_name: c.h3.clip, type: 'minimax', device: 'default' });
  const vae = add('VAELoader', { vae_name: v.vae });
  const audioVae = add('VAELoader', { vae_name: v.audioVae });
  // Extend: the video so far, and the frame where the new clip's fixed head starts (shown to the enhancer only).
  const [prev] = extend ? add('GetVideoComponents', { video: add('LoadVideo', { file: i.image }) }) : [];
  const first = extend
    ? add('ImageFromBatch', { image: [prev, 0], batch_index: -CONTEXT_FRAMES, length: 1 })
    : i.action === 'animate' && i.image ? add('LoadImage', { image: i.image }) : undefined;
  const lastFile = i.loop ? i.image : i.end_image;
  const last = first && lastFile ? (lastFile === i.image ? first : add('LoadImage', { image: lastFile })) : undefined;
  const refPictures = refs.map(({ file }) => add('LoadImage', { image: file }));
  let prompt: string | Link = i.caption ?? '';
  if (!i.caption) {
    const pictures = [...refPictures, first, last].filter((x): x is Link => !!x);
    const caption = add('TextGenerateV2', {
      clip: add('CLIPLoader', { clip_name: c.h3.peClip, type: 'minimax', device: 'default' }),
      ...Object.fromEntries(pictures.map((link, n) => [`images.image${n + 1}`, link])),
      system_prompt: refs.length ? REF_VIDEO_SYSTEM : VIDEO_SYSTEM,
      prompt: refs.length ? refVideoRequest(i, refs, { first: !!first, last: !!last }) : videoRequest(i, { first: !!first, last: !!last }),
      max_length: 4096,
      sampling_mode: 'on',
      'sampling_mode.temperature': 0.7,
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
    prompt = caption;
    add('PreviewAny', { source: caption }, 'caption');
  }
  let conditioning: Link;
  let latent: Link;
  if (r2v) {
    const target = add('MiniMaxH3ReferenceToVideo', {
      clip,
      vae,
      prompt,
      width: i.width,
      height: i.height,
      length: i.frames ?? v.frames,
      ref_image_size: 'match',
      ...Object.fromEntries(refPictures.map((link, n) => [`ref_images.ref_image_${n + 1}`, link])),
    });
    latent = out(target, 1);
    conditioning = target;
    // A first or last frame on top of the references is pinned as a keyframe.
    if (first && !extend) conditioning = add('MiniMaxH3AddGuide', { positive: conditioning, latent, frame_idx: 0, vae, image: first });
    if (last) conditioning = add('MiniMaxH3AddGuide', { positive: conditioning, latent, frame_idx: -1, vae, image: last });
  } else {
    conditioning = add('MiniMaxH3ImageToVideo', {
      clip,
      vae,
      prompt,
      width: i.width,
      height: i.height,
      length: i.frames ?? v.frames,
      ...(first ? { first_frame: first } : {}),
      ...(last ? { last_frame: last } : {}),
    });
    latent = out(conditioning, 1);
  }
  let prefixFrames: Link | undefined;
  if (extend) {
    // The previous latent's tail is copied into the new clip's head and kept by the native AV denoise masks.
    const continued = add('LumenVideoContinuation', { conditioning, latent, latent_path: i.latent_path, context_frames: CONTEXT_FRAMES });
    [conditioning, latent, prefixFrames] = [continued, out(continued, 1), out(continued, 2)];
  }
  const sampled = add('SamplerCustomAdvanced', {
    noise: add('RandomNoise', { noise_seed: i.seed }),
    guider: add('BasicGuider', { model, conditioning }),
    sampler: add('KSamplerSelect', { sampler_name: 'lcm' }),
    sigmas: add('ManualSigmas', { sigmas: v.sigmas }),
    latent_image: latent,
  });
  if (i.latent_name) add('LumenSaveVideoLatent', { latent: sampled, filename_prefix: i.latent_name });
  const av = add('LTXVSeparateAVLatent', { av_latent: sampled });
  let images: Link = add('VAEDecode', { samples: av, vae });
  let audio: Link = add('VAEDecodeAudio', { samples: out(av, 1), vae: audioVae });
  if (extend) {
    // The new clip, without the head it shares with the video, joins the end of the video.
    const stitched = add('LumenStitchVideo', {
      previous_images: [prev, 0],
      previous_audio: [prev, 1],
      images,
      audio,
      trim_frames: prefixFrames,
      fps: 24,
    });
    [images, audio] = [stitched, out(stitched, 1)];
  }
  add('SaveVideo', { video: add('CreateVideo', { images, fps: 24, audio }), filename_prefix: `lumen/${i.action}`, format: 'auto', 'format.codec': 'auto' });
  return wf;
}

/** Anima and MOSS Image with their turbo LoRAs: text to image only. */
function textToImage(i: JobInputs, engine: 'anima' | 'moss', c: ComfyConfig): ApiWorkflow {
  const { wf, add } = graph();
  const e = c[engine];
  let model = add('UNETLoader', { unet_name: unetName(i, e.unet), weight_dtype: 'default' });
  if (e.lora) model = add('LoraLoaderModelOnly', { model, lora_name: e.lora, strength_model: 1 });
  model = userLoras(add, i, model);
  const clip = add('CLIPLoader', { clip_name: e.clip, type: engine === 'anima' ? 'stable_diffusion' : 'moss_image', device: 'default' });
  const vae = add('VAELoader', { vae_name: e.vae });
  if (engine === 'anima' && i.character_images?.length) {
    // --cref on Anima: SnapRef with up to three pictures of the character; --cw is its fidelity.
    const [first, ...more] = i.character_images.slice(0, 3).map((image) => add('LoadImage', { image }));
    model = add('LumenSnapRef', {
      model,
      clip,
      vae,
      image: first,
      ...Object.fromEntries(more.map((link, n) => [`image_${n + 2}`, link])),
      adapter: c.anima.snapref,
      mode: c.anima.snaprefMode,
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

/** RelayVSR ×2: one euler step at the video's own size; VSR Decode rebuilds every frame. The audio and fps are kept. */
function upscaleVideoWorkflow(i: JobInputs, v: ComfyConfig['video']): ApiWorkflow {
  const { wf, add } = graph();
  const [parts] = add('GetVideoComponents', { video: add('LoadVideo', { file: i.image }) });
  const frames = [parts, 0];
  const model = add('UNETLoader', { unet_name: v.vsr, weight_dtype: 'default' });
  const [cond] = add('RelayVSRConditioning', { model, images: frames });
  const sampled = add('SamplerCustomAdvanced', {
    noise: add('RandomNoise', { noise_seed: i.seed }),
    guider: add('BasicGuider', { model, conditioning: [cond, 0] }),
    sampler: add('KSamplerSelect', { sampler_name: 'euler' }),
    sigmas: add('BasicScheduler', { model, scheduler: 'simple', steps: 1, denoise: 1 }),
    latent_image: [cond, 1],
  });
  const images = add('VSRDecode', { vae: add('VAELoader', { vae_name: v.vsrVae }), samples: sampled, images: frames, detail: 1 });
  add('SaveVideo', { video: add('CreateVideo', { images, fps: [parts, 2], audio: [parts, 1] }), filename_prefix: 'lumen/upscale_video', format: 'auto', 'format.codec': 'auto' });
  return wf;
}

export function builtInWorkflow(i: JobInputs): ApiWorkflow {
  switch (i.action) {
    case 'converse':
      throw new Error(t('El modo conversacional usa el GGUF de la página ComfyUI, o un workflow propio con un LLM que devuelva texto.'));
  }
  const c = getConfig();
  if (i.action === 'describe') return describeWorkflow(i, c.h3.peClip);
  if (i.action === 'video' || i.action === 'animate' || i.action === 'extend') return videoWorkflow(i, c);
  if (i.action === 'upscale_video') return upscaleVideoWorkflow(i, c.video);
  return i.engine === 'h3' ? h3Workflow(i, c.h3, c.styleCodes, c.conceptMode) : textToImage(i, i.engine, c);
}

/** Loader inputs whose files must be on the server; ComfyUI's own error lists every file it has. */
const MODEL_INPUTS = ['unet_name', 'clip_name', 'vae_name', 'lora_name', 'ckpt_name'];

/** Clear errors for a missing node or model before the workflow is sent. */
export function checkWorkflow(wf: ApiWorkflow, defs: Record<string, unknown>) {
  for (const node of Object.values(wf)) {
    if (!defs[node.class_type]) throw new Error(t('Falta el nodo {class_type} en ComfyUI. Instala o activa el pack que lo trae.', { class_type: node.class_type }));
    for (const key of MODEL_INPUTS) {
      const value = node.inputs[key];
      if (typeof value !== 'string') continue;
      const options = comboOptions(defs as Parameters<typeof comboOptions>[0], node.class_type, key);
      if (!options.includes(value)) throw new Error(t('No encuentro el modelo «{value}» ({class_type}). Elígelo en la página ComfyUI.', { value, class_type: node.class_type }));
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
      const text = [i.prompt, i.motion_prompt].filter(Boolean).join(', ');
      setText(findTextNode(wf, inp.positive), text);
      setText(findTextNode(wf, inp.conditioning), text);
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
    throw new Error(t('Este JSON es el formato de la interfaz. En ComfyUI usa «Workflow → Export (API)» y pega ese archivo.'));
  }
  if (!data || typeof data !== 'object') throw new Error(t('El workflow no es un objeto JSON.'));
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
  { key: 'prompt', desc: t('texto del prompt') },
  { key: 'concepts', desc: t('segmentos con peso (a::2), lista de {text, weight}') },
  { key: 'seed', desc: 'semilla' },
  { key: 'width', desc: t('ancho en px') },
  { key: 'height', desc: t('alto en px') },
  { key: 'batch', desc: t('imágenes por ejecución (1: el grid se hace en ejecuciones seguidas)') },
  { key: 'engine', desc: t('modelo pedido: h3, anima (--anima) o moss (--moss)') },
  { key: 'denoise', desc: t('fuerza de cambio (0–1)') },
  { key: 'image', desc: t('imagen de entrada (vary, upscale, zoom, pan)') },
  { key: 'chaos', desc: t('variedad 0–100') },
  { key: 'aspect', desc: t('relación de aspecto') },
  { key: 'pad_left', desc: t('relleno izq. (pan/zoom)') },
  { key: 'motion_prompt', desc: t('descripción del movimiento (vídeo)') },
  { key: 'motion', desc: t('movimiento: low / high (vídeo)') },
  { key: 'frames', desc: t('fotogramas del vídeo') },
  { key: 'fps', desc: t('fotogramas por segundo') },
  { key: 'end_image', desc: t('fotograma final (vídeo)') },
  { key: 'loop', desc: t('vídeo en bucle (true/false)') },
  { key: 'image_2', desc: t('2.º prompt de imagen') },
  { key: 'images', desc: t('todos los prompts de imagen (lista)') },
  { key: 'style_images', desc: t('todas las referencias de estilo (lista)') },
  { key: 'image_weight', desc: t('peso de la imagen (--iw)') },
  { key: 'style_image', desc: t('primera referencia de estilo') },
  { key: 'style_weight', desc: t('peso del estilo (--sw)') },
  { key: 'sref', desc: t('código de estilo (--sref)') },
  { key: 'moodboard', desc: t('códigos de moodboard / perfil (--p)') },
  { key: 'message', desc: t('tu mensaje (modo conversacional)') },
  { key: 'current_prompt', desc: t('el prompt actual (modo conversacional)') },
  { key: 'hd', desc: t('alta resolución (true/false)') },
  { key: 'tile', desc: t('patrón repetible (--tile)') },
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
  'upscale_video',
  'describe',
  'converse',
];
