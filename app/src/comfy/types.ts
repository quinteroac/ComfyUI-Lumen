import type { Engine } from './config';

/** Every generation button in the UI maps to one of these actions. */
export type ActionKind =
  | 'imagine'
  | 'image_prompt'
  | 'vary_subtle'
  | 'vary_strong'
  | 'upscale_subtle'
  | 'upscale_creative'
  | 'remix'
  | 'zoom_out'
  | 'pan'
  | 'edit'
  | 'retexture'
  | 'video'
  | 'animate'
  | 'extend'
  | 'describe'
  | 'converse';

export const VIDEO_ACTIONS: ActionKind[] = ['video', 'animate', 'extend'];
export const isVideoAction = (a: ActionKind) => VIDEO_ACTIONS.includes(a);

export const ACTION_LABELS: Record<ActionKind, string> = {
  imagine: 'Imaginar (texto → imagen)',
  image_prompt: 'Prompt de imagen (imagen + texto → imagen)',
  vary_subtle: 'Variar · Sutil',
  vary_strong: 'Variar · Fuerte',
  upscale_subtle: 'Ampliar · Sutil',
  upscale_creative: 'Ampliar · Creativo',
  remix: 'Remezclar (cambiar el prompt)',
  zoom_out: 'Alejar (zoom out)',
  pan: 'Desplazar (pan)',
  edit: 'Editor (borrar zonas / ampliar lienzo)',
  retexture: 'Retexturizar (misma estructura, otro estilo)',
  video: 'Vídeo (texto → vídeo)',
  animate: 'Animar (imagen → vídeo)',
  extend: 'Alargar vídeo',
  describe: 'Describir (imagen → prompts)',
  converse: 'Modo conversacional (mensaje → prompt, con un LLM)',
};

export type Motion = 'low' | 'high';
export type PanDir = 'left' | 'right' | 'up' | 'down';

/** Defaults set in the imagine bar's settings panel. */
export interface CreateSettings {
  aspect: string; // "1:1", "16:9", ...
  chaos: number; // 0..100
  /** SD (base size) or HD (twice the size, second pass). */
  resolution: 'sd' | 'hd';
  /** What the imagine bar creates. */
  output: 'image' | 'video';
  motion: Motion;
  videoResolution: 'sd' | 'hd';
  videoBatch: 1 | 2 | 4;
  /** Images per creation, made one after another. */
  grid: 1 | 2 | 3 | 4;
}

export const DEFAULT_SETTINGS: CreateSettings = {
  aspect: '1:1',
  chaos: 0,
  resolution: 'sd',
  output: 'image',
  motion: 'low',
  videoResolution: 'sd',
  videoBatch: 2,
  grid: 4,
};

/** A multi-prompt segment and its weight (a::2). */
export interface Concept {
  text: string;
  weight: number;
}

/** Everything a workflow can receive. Each key is also a {{placeholder}} name. */
export interface JobInputs {
  action: ActionKind;
  /** Model of the built-in workflows: --anima and --moss pick Anima or MOSS Image for Imagine. */
  engine: Engine;
  prompt: string;
  /** Weighted segments of the prompt, applied as concept sliders by the built-in workflows. */
  concepts: Concept[];
  seed: number;
  width: number;
  height: number;
  batch: number;
  /** How much of the image is redrawn (vary, remix, upscale): the built-in H3 workflow starts at the first sigma below it. */
  denoise: number;
  aspect: string;
  chaos: number;
  hd: boolean;
  draft: boolean;
  tile: boolean;
  /** Filename in ComfyUI's input folder (image actions, start frame, video to extend). */
  image?: string;
  /** Second image prompt. */
  image_2?: string;
  /** Every image prompt and every style reference, in the order they were added. */
  images?: string[];
  style_images?: string[];
  /** Pictures of the character (--cref) and --cw (0–100). */
  character_images?: string[];
  character_weight?: number;
  /** W:H of each picture, in the order image prompts, characters, style references. */
  picture_ratios?: string[];
  image_weight?: number;
  /** First style reference. */
  style_image?: string;
  style_weight?: number;
  sref?: string;
  /** Moodboard / profile codes used (--p). */
  moodboard?: string;
  /** Conversational mode: your message and the prompt so far. */
  message?: string;
  current_prompt?: string;
  /** Caption the edit prompt enhancer wrote for Zoom out, Pan and the Editor, reused by every image of the job. */
  caption?: string;
  /** Zoom out factor and pan direction. */
  zoom?: number;
  pan?: PanDir;
  pad_left?: number;
  pad_right?: number;
  pad_top?: number;
  pad_bottom?: number;
  /* video */
  frames?: number;
  fps?: number;
  motion?: Motion;
  /** Prompt with the motion description added (what the built-in video workflows encode). */
  motion_prompt?: string;
  end_image?: string;
  loop?: boolean;
}

export interface JobImage {
  /** URL that shows the image (ComfyUI /view, or a data URL for Explore samples). */
  url: string;
  /** ComfyUI file reference, so later actions can reuse it. */
  ref?: { filename: string; subfolder: string; type: string };
  w: number;
  h: number;
  liked?: boolean;
  trashed?: boolean;
  folderIds?: string[];
  /** 'video' for animations (mp4/webm play in a video player; webp/gif/svg animate as images). */
  kind?: 'image' | 'video';
  /** Number of times a video was extended. */
  extended?: number;
  /** Drawing recipe of the Explore, Style Creator and Personalize samples. */
  demo?: { key: number; layers: { seed: number; jitter: number }[]; frame?: { l: number; r: number; t: number; b: number }; motion?: Motion };
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

/** An image placed in the imagine bar. */
export interface RefImage {
  id: string;
  url: string;
  w: number;
  h: number;
  name: string;
  blob?: Blob;
  ref?: JobImage['ref'];
  demo?: JobImage['demo'];
}

export interface JobRefs {
  images?: RefImage[];
  style?: RefImage[];
  /** Pictures of one character (--cref). */
  character?: RefImage[];
  start?: RefImage;
  end?: RefImage;
  loop?: boolean;
}

export interface Job {
  id: string;
  createdAt: number;
  action: ActionKind;
  /** Prompt as typed (with parameters). */
  rawPrompt: string;
  /** Prompt text without parameters. */
  prompt: string;
  settings: CreateSettings;
  inputs: JobInputs;
  status: JobStatus;
  progress: number; // 0..1
  message?: string;
  promptId?: string;
  images: JobImage[];
  /** Describe results. */
  texts?: string[];
  /** Styles the --sref codes mixed, one per line with its weight. */
  styleList?: string;
  folderId?: string;
  /** Job + image index this one came from (vary/upscale/...). */
  parent?: { jobId: string; index: number };
  /** References used (shown next to the prompt; small copies only). */
  refs?: { kind: 'image' | 'style' | 'character' | 'start' | 'end'; url: string }[];
  /** What "Repeat" needs to run this action again. */
  rerun?: { image?: JobImage; zoom?: number; pan?: PanDir; motion?: Motion; motionPrompt?: string; refs?: JobRefs; strength?: 'subtle' | 'strong'; mask?: string };
}

export interface Folder {
  id: string;
  name: string;
  groupId?: string;
}

export interface FolderGroup {
  id: string;
  name: string;
}

/** An image kept in a moodboard (small copy so it survives a reload). */
export interface BoardImage {
  id: string;
  url: string;
  w: number;
  h: number;
  ref?: JobImage['ref'];
  demo?: JobImage['demo'];
}

export interface Moodboard {
  /** "m…" ID used as --p m… */
  id: string;
  name: string;
  images: BoardImage[];
  /** Optional words describing the look (used by the built-in workflows, which can't read images as style). */
  words: string;
  isDefault: boolean;
  createdAt: number;
}

/** A moodboard or profile version: what a --p code points to (codes keep working after edits or deletion). */
export interface MoodSnapshot {
  code: string;
  boardId: string;
  name: string;
  words: string;
  images: BoardImage[];
  kind?: 'moodboard' | 'profile';
}

/** Personalization profile: learns your taste from the images you pick. */
export interface Profile {
  /** "global" for the Global Profile, "u…" for the others. */
  id: string;
  name: string;
  /** Score per style atom (see styles.ts). */
  scores: Record<string, number>;
  picks: number;
  isDefault: boolean;
  createdAt: number;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Prompt the assistant wrote. */
  prompt?: string;
  /** Jobs it started. */
  jobIds?: string[];
}
