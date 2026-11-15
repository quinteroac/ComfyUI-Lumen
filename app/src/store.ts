// Everything you create (jobs), the imagine bar (prompt, references, remix),
// folders, likes and trash — and the engine that turns any button press into a
// ComfyUI workflow run.
import { useSyncExternalStore } from 'react';
import { save, saved as loadFile } from './saved';
import { getConfig } from './comfy/config';
import { buildWorkflow, checkWorkflow, enhanced } from './comfy/workflows';
import { isVideoFile, nodeDefs, reuseOutputAsInput, runWorkflow, uploadImage, viewUrl, type ImageRef } from './comfy/client';
import type { ActionKind, BoardImage, ChatTurn, CreateSettings, Folder, FolderGroup, Job, JobImage, JobInputs, JobRefs, Moodboard, MoodSnapshot, Motion, PanDir, Profile, RefImage } from './comfy/types';
import { ATOM_GROUPS, atomsFromText, learnedWords, type Sample } from './styles';
import { DEFAULT_SETTINGS, isVideoAction } from './comfy/types';
import { hash, toPngBlob } from './demo';
import { expandPermutations, parsePrompt, type ParsedPrompt } from './prompt';
import { navigate } from './router';
import { assist, type AssistantResult } from './assistant';

export { parsePrompt };

/* ------------------------------ state ------------------------------ */

export type RefSlot = 'images' | 'style' | 'start' | 'end';

/** Something the next submit of the imagine bar will continue from. */
export interface Pending {
  kind: 'remix' | 'extend';
  strength?: 'subtle' | 'strong';
  source?: { jobId: string; index: number };
  image: JobImage;
  originalPrompt: string;
}

/** Image open in the Editor page. */
export interface EditorTarget {
  image: JobImage;
  prompt: string;
  source?: { jobId: string; index: number };
}

interface State {
  jobs: Job[];
  settings: CreateSettings;
  draft: string;
  refs: { images: RefImage[]; style: RefImage[]; start?: RefImage; end?: RefImage; loop: boolean };
  refsLocked: boolean;
  draftMode: boolean;
  pending?: Pending;
  folders: Folder[];
  folderGroups: FolderGroup[];
  currentFolder?: string;
  moodboards: Moodboard[];
  /** Every moodboard version used in a prompt, by --p code. */
  moodCodes: Record<string, MoodSnapshot>;
  /** Personalization button: adds the default moodboards and profiles (--p) to every prompt. */
  personalization: boolean;
  profiles: Profile[];
  /** Conversational mode: the bar talks to an assistant that writes the prompts. */
  conversational: boolean;
  chat: ChatTurn[];
  editor?: EditorTarget;
  toasts: { id: number; text: string; kind: 'info' | 'error' }[];
  likedExplore: string[];
  likedStyles: string[];
}

/** Picks needed to unlock a profile. */
export const UNLOCK_PICKS = 25;
const GLOBAL_PROFILE = (): Profile => ({ id: 'global', name: 'Perfil global', scores: {}, picks: 0, isDefault: true, createdAt: Date.now() });
const listeners = new Set<() => void>();
const EMPTY_REFS: State['refs'] = { images: [], style: [], loop: false };
let state: State = load();

function load(): State {
  const fresh: State = {
    jobs: [],
    settings: { ...DEFAULT_SETTINGS },
    draft: '',
    refs: EMPTY_REFS,
    refsLocked: false,
    draftMode: false,
    folders: [],
    folderGroups: [],
    moodboards: [],
    moodCodes: {},
    personalization: false,
    profiles: [GLOBAL_PROFILE()],
    conversational: false,
    chat: [],
    toasts: [],
    likedExplore: [],
    likedStyles: [],
  };
  const saved = loadFile<SavedState>('state');
  if (!saved) return fresh;
  const jobs: Job[] = (saved.jobs ?? []).map((j: Job) => ({
    ...j,
    ...(j.status === 'running' || j.status === 'queued' ? { status: 'error', message: 'Interrumpido al recargar la página.' } : {}),
  }));
  return {
    ...fresh,
    jobs,
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    likedExplore: saved.likedExplore ?? [],
    likedStyles: saved.likedStyles ?? [],
    folders: saved.folders ?? [],
    folderGroups: saved.folderGroups ?? [],
    moodboards: saved.moodboards ?? [],
    moodCodes: saved.moodCodes ?? {},
    personalization: !!saved.personalization,
    profiles: saved.profiles?.some((p: Profile) => p.id === 'global') ? saved.profiles : [GLOBAL_PROFILE(), ...(saved.profiles ?? [])],
    conversational: !!saved.conversational,
    draftMode: !!saved.draftMode,
  };
}

type SavedState = Partial<Pick<State, 'jobs' | 'settings' | 'likedExplore' | 'likedStyles' | 'folders' | 'folderGroups' | 'moodboards' | 'moodCodes' | 'personalization' | 'profiles' | 'conversational' | 'draftMode'>>;

function persist() {
  const data: SavedState = {
    jobs: state.jobs,
    settings: state.settings,
    likedExplore: state.likedExplore,
    likedStyles: state.likedStyles,
    folders: state.folders,
    folderGroups: state.folderGroups,
    moodboards: state.moodboards,
    moodCodes: state.moodCodes,
    personalization: state.personalization,
    profiles: state.profiles,
    conversational: state.conversational,
    draftMode: state.draftMode,
  };
  save('state', data);
}

function set(patch: Partial<State>, save = true) {
  state = { ...state, ...patch };
  if (save) persist();
  listeners.forEach((l) => l());
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pick(state),
  );
}

export const getState = () => state;

function updateJob(id: string, patch: Partial<Job>, save = true) {
  set({ jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }, save);
}

function updateImage(jobId: string, index: number, patch: Partial<JobImage>) {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  updateJob(jobId, { images: job.images.map((im, i) => (i === index ? { ...im, ...patch } : im)) });
}

/* ------------------------------ ui helpers ------------------------------ */

let toastId = 0;
export function toast(text: string, kind: 'info' | 'error' = 'info') {
  const id = ++toastId;
  set({ toasts: [...state.toasts, { id, text, kind }] }, false);
  window.setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }, false), kind === 'error' ? 7000 : 3500);
}

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const setDraft = (draft: string) => set({ draft }, false);
export const setSettings = (p: Partial<CreateSettings>) => set({ settings: { ...state.settings, ...p } });
export const toggleDraftMode = () => set({ draftMode: !state.draftMode });
/** Likes in Explore also teach your Global Profile (as on the original). */
export const toggleExploreLike = (id: string, prompt?: string) => {
  const liking = !state.likedExplore.includes(id);
  const atoms = prompt ? atomsFromText(prompt) : [];
  const profiles = atoms.length
    ? state.profiles.map((p) => {
        if (p.id !== 'global') return p;
        const scores = { ...p.scores };
        for (const a of atoms) scores[a] = (scores[a] ?? 0) + (liking ? 0.5 : -0.5);
        return { ...p, scores };
      })
    : state.profiles;
  set({ likedExplore: liking ? [...state.likedExplore, id] : state.likedExplore.filter((x) => x !== id), profiles });
};
export const toggleStyleLike = (code: string) =>
  set({ likedStyles: state.likedStyles.includes(code) ? state.likedStyles.filter((x) => x !== code) : [...state.likedStyles, code] });
export const toggleLike = (jobId: string, index: number) => {
  const im = state.jobs.find((j) => j.id === jobId)?.images[index];
  if (im) updateImage(jobId, index, { liked: !im.liked });
};
export const setTrashed = (items: { jobId: string; index: number }[], trashed: boolean) => {
  const keys = new Set(items.map((i) => `${i.jobId}:${i.index}`));
  set({ jobs: state.jobs.map((j) => ({ ...j, images: j.images.map((im, i) => (keys.has(`${j.id}:${i}`) ? { ...im, trashed } : im)) })) });
};
export const setLiked = (items: { jobId: string; index: number }[], liked: boolean) => {
  const keys = new Set(items.map((i) => `${i.jobId}:${i.index}`));
  set({ jobs: state.jobs.map((j) => ({ ...j, images: j.images.map((im, i) => (keys.has(`${j.id}:${i}`) ? { ...im, liked } : im)) })) });
};
/** Trash a whole job (its images can be restored from Organize → Papelera). */
export const trashJob = (jobId: string) => {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  if (!job.images.length) set({ jobs: state.jobs.filter((j) => j.id !== jobId) });
  else updateJob(jobId, { images: job.images.map((im) => ({ ...im, trashed: true })) });
};
export const emptyTrash = () =>
  set({
    jobs: state.jobs
      .map((j) => ({ ...j, images: j.images.filter((im) => !im.trashed) }))
      .filter((j) => j.images.length || j.status !== 'done' || j.texts?.length),
  });

/* ------------------------------ folders ------------------------------ */

export function createFolder(name: string): Folder | undefined {
  const n = name.trim();
  if (!n) return;
  if (state.folders.some((f) => f.name.toLowerCase() === n.toLowerCase())) {
    toast('Ya existe una carpeta con ese nombre.', 'error');
    return;
  }
  const f = { id: uid('f'), name: n };
  set({ folders: [...state.folders, f] });
  return f;
}
export const renameFolder = (id: string, name: string) => set({ folders: state.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) });
export const deleteFolder = (id: string) =>
  set({
    folders: state.folders.filter((f) => f.id !== id),
    currentFolder: state.currentFolder === id ? undefined : state.currentFolder,
    jobs: state.jobs.map((j) => ({
      ...j,
      folderId: j.folderId === id ? undefined : j.folderId,
      images: j.images.map((im) => (im.folderIds?.includes(id) ? { ...im, folderIds: im.folderIds.filter((x) => x !== id) } : im)),
    })),
  });
export const openFolder = (id?: string) => set({ currentFolder: id }, false);
export const addToFolder = (items: { jobId: string; index: number }[], folderId: string, add = true) => {
  const keys = new Set(items.map((i) => `${i.jobId}:${i.index}`));
  set({
    jobs: state.jobs.map((j) => ({
      ...j,
      images: j.images.map((im, i) => {
        if (!keys.has(`${j.id}:${i}`)) return im;
        const ids = new Set(im.folderIds ?? []);
        if (add) ids.add(folderId);
        else ids.delete(folderId);
        return { ...im, folderIds: [...ids] };
      }),
    })),
  });
};
export function inFolder(job: Job, im: JobImage, folderId: string) {
  return job.folderId === folderId || !!im.folderIds?.includes(folderId);
}

/** Images in a folder (not in the trash). */
export function folderImages(folderId: string): { job: Job; img: JobImage; index: number }[] {
  return state.jobs.flatMap((job) => job.images.map((img, index) => ({ job, img, index })).filter(({ img }) => !img.trashed && inFolder(job, img, folderId)));
}

export function downloadFolder(folderId: string) {
  const items = folderImages(folderId);
  if (!items.length) {
    toast('La carpeta está vacía.');
    return;
  }
  items.forEach(({ img, job, index }, n) =>
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = img.url;
      a.download = `lumen-${job.id}-${index}`;
      a.target = '_blank';
      a.click();
    }, n * 250),
  );
}

export function createFolderGroup(name: string): FolderGroup | undefined {
  const n = name.trim();
  if (!n) return;
  if (state.folderGroups.some((g) => g.name.toLowerCase() === n.toLowerCase())) {
    toast('Ya existe un grupo con ese nombre.', 'error');
    return;
  }
  const g = { id: uid('g'), name: n };
  set({ folderGroups: [...state.folderGroups, g] });
  return g;
}
export const renameFolderGroup = (id: string, name: string) =>
  set({ folderGroups: state.folderGroups.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g)) });
/** Moves a folder into a group (or out of it). Groups left empty are removed. */
export function moveFolderToGroup(folderId: string, groupId?: string) {
  const prevGroup = state.folders.find((f) => f.id === folderId)?.groupId;
  const folders = state.folders.map((f) => (f.id === folderId ? { ...f, groupId } : f));
  const prevEmpty = !!prevGroup && prevGroup !== groupId && !folders.some((f) => f.groupId === prevGroup);
  set({ folders, folderGroups: prevEmpty ? state.folderGroups.filter((g) => g.id !== prevGroup) : state.folderGroups });
}
export const deleteFolderGroup = (id: string) =>
  set({ folderGroups: state.folderGroups.filter((g) => g.id !== id), folders: state.folders.map((f) => (f.groupId === id ? { ...f, groupId: undefined } : f)) });

/* ------------------------------ moodboards & personalization ------------------------------ */

export function createMoodboard(name: string): Moodboard {
  const m: Moodboard = { id: `m${Math.random().toString(36).slice(2, 9)}`, name: name.trim() || 'Moodboard sin nombre', images: [], words: '', isDefault: state.moodboards.length === 0, createdAt: Date.now() };
  set({ moodboards: [m, ...state.moodboards] });
  return m;
}
const updateBoard = (id: string, fn: (m: Moodboard) => Moodboard) => set({ moodboards: state.moodboards.map((m) => (m.id === id ? fn(m) : m)) });
export const renameMoodboard = (id: string, name: string) => updateBoard(id, (m) => ({ ...m, name: name.trim() || m.name }));
export const setMoodboardWords = (id: string, words: string) => updateBoard(id, (m) => ({ ...m, words }));
export const toggleMoodboardDefault = (id: string) => updateBoard(id, (m) => ({ ...m, isDefault: !m.isDefault }));
export const addBoardImages = (id: string, imgs: Omit<BoardImage, 'id'>[]) =>
  updateBoard(id, (m) => ({ ...m, images: [...m.images, ...imgs.map((im) => ({ ...im, id: uid('b') }))].slice(0, 60) }));
export const removeBoardImage = (id: string, imageId: string) => updateBoard(id, (m) => ({ ...m, images: m.images.filter((im) => im.id !== imageId) }));
/** Deleted moodboards disappear from the list; their codes keep working. */
export const deleteMoodboard = (id: string) => set({ moodboards: state.moodboards.filter((m) => m.id !== id) });
export const togglePersonalization = () => {
  if (!state.personalization && !defaultSnapshots().length) {
    toast(isUnlocked(state.profiles[0]) ? 'Marca un perfil o moodboard como predeterminado.' : `Desbloquea tu perfil global eligiendo ${UNLOCK_PICKS} imágenes, o crea un moodboard.`, 'error');
    navigate('personalize');
    return;
  }
  set({ personalization: !state.personalization });
};

/* ------------------------------ personalization profiles ------------------------------ */

export const isUnlocked = (p?: Profile) => !!p && p.picks >= UNLOCK_PICKS;
const globalUnlocked = () => isUnlocked(state.profiles.find((p) => p.id === 'global'));

export function createProfile(name: string): Profile | undefined {
  if (!globalUnlocked()) {
    toast(`Primero desbloquea tu perfil global (${UNLOCK_PICKS} imágenes elegidas).`, 'error');
    return;
  }
  const p: Profile = { id: `u${Math.random().toString(36).slice(2, 9)}`, name: name.trim() || 'Perfil nuevo', scores: {}, picks: 0, isDefault: false, createdAt: Date.now() };
  set({ profiles: [...state.profiles, p] });
  return p;
}
const updateProfile = (id: string, fn: (p: Profile) => Profile) => set({ profiles: state.profiles.map((p) => (p.id === id ? fn(p) : p)) });
export const renameProfile = (id: string, name: string) => updateProfile(id, (p) => ({ ...p, name: name.trim() || p.name }));
export const toggleProfileDefault = (id: string) => updateProfile(id, (p) => ({ ...p, isDefault: !p.isDefault }));
/** The Global Profile can't be deleted; codes from deleted profiles keep working. */
export const deleteProfile = (id: string) => id !== 'global' && set({ profiles: state.profiles.filter((p) => p.id !== id) });
/** Picking an image raises its looks; the ones shown next to it and skipped go down a little. */
export function recordProfilePicks(id: string, picked: Sample[], skipped: Sample[]) {
  updateProfile(id, (p) => {
    const scores = { ...p.scores };
    for (const s of picked) for (const g of ATOM_GROUPS) scores[s.atoms[g]] = (scores[s.atoms[g]] ?? 0) + 1;
    for (const s of skipped) for (const g of ATOM_GROUPS) scores[s.atoms[g]] = (scores[s.atoms[g]] ?? 0) - 0.2;
    return { ...p, scores, picks: p.picks + picked.length };
  });
}
export function profileWords(p: Profile): string {
  return learnedWords(p.scores);
}
export function profileCode(p: Profile): string {
  return `p${(hash(p.id + '|' + profileWords(p) + '|' + p.picks) % 2176782336).toString(36).padStart(6, '0')}`;
}

function profileSnapshot(p: Profile): MoodSnapshot {
  return { code: profileCode(p), boardId: p.id, name: p.name, words: profileWords(p), images: [], kind: 'profile' };
}

/** Snapshots for "--p" with no ID: default moodboards (with images) and unlocked default profiles. */
function defaultSnapshots(): MoodSnapshot[] {
  return [
    ...state.profiles.filter((p) => p.isDefault && isUnlocked(p)).map(profileSnapshot),
    ...state.moodboards.filter((b) => b.isDefault && b.images.length).map(snapshot),
  ];
}

/** The code for a moodboard's current version (changes when its images or words change). */
export function moodboardCode(m: Moodboard): string {
  return `p${(hash(m.id + '|' + m.images.map((i) => i.id).join(',') + '|' + m.words) % 2176782336).toString(36).padStart(6, '0')}`;
}

function snapshot(m: Moodboard): MoodSnapshot {
  return { code: moodboardCode(m), boardId: m.id, name: m.name, words: m.words, images: m.images.slice(0, 6), kind: 'moodboard' };
}

/**
 * Personalization: adds --p when the button is on, and turns "--p" / "--p mID"
 * into version codes (like the original does when a prompt is sent).
 */
export function resolvePersonalization(text: string): string {
  let t = text;
  if (state.personalization && !/(^|\s)--(p|profile|personalize)\b/i.test(t)) t = `${t} --p`;
  const m = t.match(/(^|\s)--(p|profile|personalize)\b([^-]*)/i);
  if (!m) return t;
  const tokens = m[3].trim() ? m[3].trim().split(/\s+/) : ['default'];
  const codes: string[] = [];
  const snaps: Record<string, MoodSnapshot> = {};
  for (const tok of tokens) {
    const profile = state.profiles.find((p) => p.id === tok);
    const board = state.moodboards.find((b) => b.id === tok);
    const found: MoodSnapshot[] =
      tok === 'default' ? defaultSnapshots() : profile && isUnlocked(profile) ? [profileSnapshot(profile)] : board?.images.length ? [snapshot(board)] : [];
    if (found.length) {
      for (const s of found) {
        snaps[s.code] = s;
        codes.push(s.code);
      }
    } else if (state.moodCodes[tok]) codes.push(tok);
    else if (profile) toast(`El perfil «${profile.name}» aún no está desbloqueado (${profile.picks}/${UNLOCK_PICKS}).`, 'error');
    else toast(tok === 'default' ? `No tienes perfiles ni moodboards predeterminados listos. Desbloquea tu perfil global eligiendo ${UNLOCK_PICKS} imágenes.` : `No conozco «${tok}».`, 'error');
  }
  if (Object.keys(snaps).length) set({ moodCodes: { ...state.moodCodes, ...snaps } });
  const replacement = codes.length ? `${m[1]}--p ${[...new Set(codes)].join(' ')} ` : m[1];
  return t.replace(m[0], replacement).replace(/\s+/g, ' ').trim();
}

/* ------------------------------ imagine bar references ------------------------------ */

export function addRef(slot: RefSlot, img: Omit<RefImage, 'id'>) {
  const r: RefImage = { ...img, id: uid('r') };
  const refs = { ...state.refs };
  if (slot === 'images') refs.images = [...refs.images, r].slice(-4);
  else if (slot === 'style') refs.style = [...refs.style, r].slice(-4);
  else refs[slot] = r;
  // A start frame means a video; an image prompt or style means a still image.
  const output = slot === 'start' || slot === 'end' ? 'video' : state.settings.output === 'video' && !refs.start ? 'image' : state.settings.output;
  set({ refs, settings: { ...state.settings, output } }, false);
}
export function removeRef(slot: RefSlot, id?: string) {
  const refs = { ...state.refs };
  if (slot === 'images' || slot === 'style') refs[slot] = refs[slot].filter((r) => r.id !== id);
  else refs[slot] = undefined;
  set({ refs }, false);
}
export const clearRefs = () => set({ refs: EMPTY_REFS, pending: undefined }, false);
export const setLoop = (loop: boolean) => set({ refs: { ...state.refs, loop } }, false);
export const toggleRefsLock = () => set({ refsLocked: !state.refsLocked }, false);
export const imageToRef = (img: JobImage, name = `img_${Date.now()}.png`): Omit<RefImage, 'id'> => ({ url: img.url, w: img.w, h: img.h, name, ref: img.ref, demo: img.demo });

/** Remix / Extend manual: put the image in the bar with its prompt, ready to edit. */
export function startPending(p: Pending) {
  set({ pending: p, draft: p.originalPrompt }, false);
}
export const cancelPending = () => set({ pending: undefined }, false);

export const openEditor = (t?: EditorTarget) => set({ editor: t }, false);

/* ------------------------------ sizes ------------------------------ */

const PIXELS_PER_MP = 1024 * 1024;

/** The same shape at a number of megapixels, in multiples of 32 (H3 Image's canvas grid). */
export function fitArea(w: number, h: number, megapixels: number) {
  const k = Math.sqrt((megapixels * PIXELS_PER_MP) / (w * h));
  const side = (v: number) => Math.max(32, Math.round((v * k) / 32) * 32);
  return { w: side(w), h: side(h) };
}

export function aspectSize(aspect: string, megapixels: number) {
  const [a, b] = aspect.split(':').map(Number);
  return a && b ? fitArea(a, b, megapixels) : fitArea(1, 1, megapixels);
}

const megapixelsOf = (w: number, h: number) => (w * h) / PIXELS_PER_MP;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** "1024x768" → "4:3", as the edit prompt enhancer wants each picture's shape. */
const reducedRatio = (w: number, h: number) => (w && h ? `${Math.round(w) / gcd(Math.round(w), Math.round(h))}:${Math.round(h) / gcd(Math.round(w), Math.round(h))}` : '');

const MOTION_WORDS: Record<Motion, string> = {
  low: 'subtle motion, slow gentle camera movement',
  high: 'dynamic motion, fast camera movement, lots of action',
};

/** Pictures in a job (image prompts, style references) only work on H3 Image. */
export function baseInputs(action: ActionKind, p: ParsedPrompt, draftMode: boolean, pictures = false): JobInputs {
  const c = getConfig();
  const s = p.settings;
  const draft = action === 'imagine' && (p.draft || draftMode);
  const hd = s.resolution === 'hd' && !draft;
  // Anima and MOSS Image only make new images; everything made from an image runs on H3 Image.
  const engine = action === 'imagine' && !pictures ? p.engine : 'h3';
  const { w, h } = aspectSize(s.aspect, c[engine][draft ? 'draft' : hd ? 'hd' : 'sd']);
  return {
    action,
    engine,
    prompt: p.prompt,
    concepts: p.concepts,
    seed: p.seed ?? Math.floor(Math.random() * 2 ** 32),
    width: w,
    height: h,
    batch: s.grid,
    denoise: 1,
    aspect: s.aspect,
    stylize: s.stylize,
    weird: s.weird,
    chaos: s.chaos,
    mode: s.mode,
    speed: s.speed,
    quality: p.quality,
    hd,
    draft,
    tile: p.tile,
    image_weight: p.imageWeight,
    style_weight: p.styleWeight ?? 100,
    sref: p.sref,
  };
}

/** Video sizes and lengths for custom video workflows (H3 frames run at 24 fps). */
function applyVideo(inputs: JobInputs, p: ParsedPrompt, motion: Motion, motionPrompt: string | undefined, fromW: number, fromH: number) {
  const s = p.settings;
  const { w, h } = fitArea(fromW, fromH, s.videoResolution === 'hd' ? 0.9 : 0.4);
  const describe = motionPrompt?.trim() ? motionPrompt.trim() : MOTION_WORDS[motion];
  Object.assign(inputs, {
    width: w,
    height: h,
    batch: s.videoBatch,
    frames: 121,
    fps: 24,
    motion,
    motion_prompt: [inputs.prompt, describe].filter(Boolean).join(', '),
    denoise: 1,
    hd: s.videoResolution === 'hd',
  });
}

/* ------------------------------ actions ------------------------------ */

export interface ActionOptions {
  /** One of your images this action starts from. */
  source?: { jobId: string; index: number };
  /** Any other starting image (Explore, uploads). */
  image?: JobImage;
  /** Prompt (with parameters) to use instead of the source's. */
  prompt?: string;
  strength?: 'subtle' | 'strong';
  zoom?: number;
  pan?: PanDir;
  motion?: Motion;
  motionPrompt?: string;
  refs?: JobRefs;
  /** Editor: PNG (data URL) whose transparent pixels are regenerated. */
  mask?: string;
  maskSize?: { w: number; h: number };
  /** Add the parameters to the prompt (e.g. "--hd"). */
  extraParams?: string;
}

/** The imagine bar's send button: decides the action from the references and settings. */
export function submitBar(keepPrompt = false): Job[] {
  const text = state.draft.trim();
  const p = state.pending;
  const refs = state.refs;
  let jobs: Job[] = [];
  if (p) {
    jobs = runAction(p.kind, { source: p.source, image: p.image, prompt: text || p.originalPrompt, strength: p.strength });
  } else {
    const first = parsePrompt(expandPermutations(text)[0] ?? '', state.settings);
    const wantsVideo = state.settings.output === 'video' || first.video || !!refs.start;
    const action: ActionKind = wantsVideo ? (refs.start ? 'animate' : 'video') : refs.images.length ? 'image_prompt' : 'imagine';
    if (!text && (action === 'imagine' || action === 'video')) {
      toast(action === 'video' ? 'Describe el vídeo o añade un fotograma inicial.' : 'Escribe qué quieres imaginar.', 'error');
      return [];
    }
    const jobRefs: JobRefs = { images: refs.images, style: refs.style, start: refs.start, end: refs.end, loop: refs.loop || first.loop };
    jobs = runAction(action, { prompt: text, refs: jobRefs, image: refs.start ? refToImage(refs.start) : undefined });
  }
  if (jobs.length) {
    set({
      draft: keepPrompt ? state.draft : '',
      pending: undefined,
      refs: state.refsLocked ? state.refs : EMPTY_REFS,
    }, false);
  }
  return jobs;
}

function refToImage(r: RefImage): JobImage {
  return { url: r.url, w: r.w, h: r.h, ref: r.ref, demo: r.demo };
}

/**
 * The single entry point for every generation button. Expands permutations and
 * --repeat, then creates one job per prompt.
 */
export function runAction(action: ActionKind, opts: ActionOptions = {}): Job[] {
  const src = opts.source ? state.jobs.find((j) => j.id === opts.source!.jobId) : undefined;
  let text = opts.prompt ?? src?.rawPrompt ?? '';
  if (opts.extraParams) text = `${text} ${opts.extraParams}`;
  if (action !== 'describe' && action !== 'extend') text = resolvePersonalization(text);
  // --sref random becomes a code, so Repeat and Use keep the same styles (as on the original).
  text = text.replace(/(--sref\s+(?:[^-\s]+\s+)*?)random\b/gi, (_m, head: string) => `${head}${1 + Math.floor(Math.random() * 4294967295)}`);
  const prompts = expandPermutations(text);
  if (prompts.length > 1) toast(`${prompts.length} prompts por permutación.`);
  const jobs: Job[] = [];
  for (const one of prompts) {
    const parsed = parsePrompt(one, src?.settings ?? state.settings);
    for (let r = 0; r < parsed.repeat; r++) {
      const job = createJob(action, one, parsed, opts, src);
      if (!job) return jobs;
      jobs.push(job);
    }
  }
  return jobs;
}

function createJob(action: ActionKind, rawPrompt: string, parsed: ParsedPrompt, opts: ActionOptions, src?: Job): Job | undefined {
  const cfg = getConfig();
  const srcImg = opts.image ?? (opts.source ? src?.images[opts.source.index] : undefined);
  let refs = opts.refs ?? {};
  // Moodboards (--p codes): their images act as style references and their words join the prompt.
  const moods = (parsed.profiles ?? []).map((c) => state.moodCodes[c]).filter(Boolean);
  if (moods.length && !refs.style?.length) {
    const imgs = moods.flatMap((m) => m.images).slice(0, 4);
    refs = { ...refs, style: imgs.map((b) => ({ id: b.id, url: b.url, w: b.w, h: b.h, name: `${b.id}.png`, ref: b.ref, demo: b.demo })) };
  }
  const pictures = !!(refs.images?.length || refs.style?.length);
  if (pictures && parsed.engine !== 'h3') toast('Las imágenes de referencia solo funcionan con H3 Image: se usa H3 Image.', 'info');
  const inputs = baseInputs(action, parsed, state.draftMode, pictures);
  if (moods.length) {
    const words = moods.map((m) => m.words.trim()).filter(Boolean).join(', ');
    if (words && !isVideoAction(action)) inputs.prompt = [inputs.prompt, words].filter(Boolean).join(', ');
    inputs.moodboard = moods.map((m) => m.code).join(' ');
    inputs.style_weight = parsed.styleWeight ?? parsed.settings.stylize;
  }
  const motion: Motion = opts.motion ?? parsed.settings.motion ?? 'low';
  // Seeds stay fixed only when --seed is given; repeats/permutations get new ones.
  if (parsed.seed === undefined) inputs.seed = Math.floor(Math.random() * 2 ** 32);

  const needsImage: ActionKind[] = ['vary_subtle', 'vary_strong', 'upscale_subtle', 'upscale_creative', 'remix', 'zoom_out', 'pan', 'edit', 'animate', 'extend', 'describe'];
  if (needsImage.includes(action) && !srcImg && !opts.mask) {
    toast('Esta acción necesita una imagen de partida.', 'error');
    return;
  }

  const w = srcImg?.w ?? inputs.width;
  const h = srcImg?.h ?? inputs.height;
  // Made from an image: the same size, except drafts, which come back at the normal size.
  const same = src?.inputs.draft ? fitArea(w, h, cfg.h3.sd) : fitArea(w, h, megapixelsOf(w, h));
  // Denoise is where H3 Image starts redrawing (its sigmas: 0.97 0.89 0.75 0.53 0.23); Variety starts earlier.
  const chaos = parsed.settings.chaos / 400;
  switch (action) {
    case 'image_prompt':
      // Kept for custom workflows; the built-in one sends the images as pictures.
      inputs.denoise = Math.min(0.95, Math.max(0.3, 1 - 0.25 * (parsed.imageWeight ?? 1)));
      break;
    case 'vary_subtle':
    case 'vary_strong':
      Object.assign(inputs, { width: same.w, height: same.h, denoise: Math.min(0.97, (action === 'vary_subtle' ? 0.75 : 0.89) + chaos) });
      break;
    case 'remix':
      Object.assign(inputs, { width: same.w, height: same.h, denoise: opts.strength === 'subtle' ? 0.75 : 0.97 });
      break;
    case 'upscale_subtle':
    case 'upscale_creative': {
      const big = fitArea(w, h, cfg.upscaleMegapixels);
      Object.assign(inputs, { width: big.w, height: big.h, batch: 1, hd: false, denoise: action === 'upscale_subtle' ? 0.54 : 0.76 });
      break;
    }
    case 'zoom_out': {
      const f = opts.zoom ?? 2;
      const px = (v: number) => Math.round(((f - 1) / 2) * v);
      const out = fitArea(w + 2 * px(w), h + 2 * px(h), megapixelsOf(w, h));
      Object.assign(inputs, { zoom: f, pad_left: px(w), pad_right: px(w), pad_top: px(h), pad_bottom: px(h), width: out.w, height: out.h });
      break;
    }
    case 'pan': {
      const d = opts.pan ?? 'right';
      const amtW = Math.round(w / 2), amtH = Math.round(h / 2);
      const across = d === 'left' || d === 'right';
      const out = fitArea(w + (across ? amtW : 0), h + (across ? 0 : amtH), megapixelsOf(w, h));
      Object.assign(inputs, {
        pan: d,
        pad_left: d === 'left' ? amtW : 0,
        pad_right: d === 'right' ? amtW : 0,
        pad_top: d === 'up' ? amtH : 0,
        pad_bottom: d === 'down' ? amtH : 0,
        width: out.w,
        height: out.h,
      });
      break;
    }
    case 'edit': {
      const mw = opts.maskSize?.w ?? w, mh = opts.maskSize?.h ?? h;
      const out = fitArea(mw, mh, megapixelsOf(mw, mh));
      Object.assign(inputs, { width: out.w, height: out.h });
      break;
    }
    case 'video': {
      const { w: aw, h: ah } = aspectSize(parsed.settings.aspect, 1);
      applyVideo(inputs, parsed, motion, opts.motionPrompt, aw, ah);
      break;
    }
    case 'animate':
      applyVideo(inputs, parsed, motion, opts.motionPrompt, w, h);
      inputs.loop = !!refs.loop;
      break;
    case 'extend':
      if ((srcImg?.extended ?? 0) >= 4) {
        toast('Un vídeo se puede alargar como máximo 4 veces.', 'error');
        return;
      }
      applyVideo(inputs, parsed, motion, opts.motionPrompt, w, h);
      Object.assign(inputs, { width: w, height: h, batch: 1 });
      break;
    case 'describe':
      inputs.batch = 1;
      break;
  }

  const display = (r?: RefImage, kind?: 'image' | 'style' | 'start' | 'end') => (r && kind && !r.url.startsWith('blob:') && r.url.length < 20000 ? [{ kind, url: r.url }] : []);
  const job: Job = {
    id: uid('j'),
    createdAt: Date.now(),
    action,
    rawPrompt,
    prompt: parsed.plain || (isVideoAction(action) ? 'Animación de la imagen' : action === 'describe' ? 'Describir imagen' : ''),
    settings: parsed.settings,
    inputs,
    status: 'queued',
    progress: 0,
    images: [],
    folderId: state.currentFolder,
    parent: opts.source,
    refs: [
      ...(refs.images ?? []).flatMap((r) => display(r, 'image')),
      ...(refs.style ?? []).flatMap((r) => display(r, 'style')),
      ...display(refs.start, 'start'),
      ...display(refs.end, 'end'),
    ],
    rerun: {
      image: srcImg && srcImg.url.length < 200000 ? srcImg : undefined,
      zoom: opts.zoom,
      pan: opts.pan,
      motion: isVideoAction(action) ? motion : undefined,
      motionPrompt: opts.motionPrompt,
      strength: opts.strength,
      refs: opts.refs ? { ...opts.refs, images: opts.refs.images?.map(({ blob: _b, ...r }) => r), style: opts.refs.style?.map(({ blob: _b, ...r }) => r) } : undefined,
    },
  };
  set({ jobs: [job, ...state.jobs] });
  void execute(job, srcImg, refs, opts.mask);
  return job;
}

const controllers = new Map<string, AbortController>();

export function cancelJob(jobId: string) {
  controllers.get(jobId)?.abort();
  updateJob(jobId, { status: 'cancelled', message: 'Cancelado' });
}

async function execute(job: Job, srcImg: JobImage | undefined, refs: JobRefs, mask?: string) {
  const ctrl = new AbortController();
  controllers.set(job.id, ctrl);
  try {
    const out = await runComfy(job, srcImg, refs, ctrl.signal, mask);
    if (ctrl.signal.aborted) return;
    updateJob(job.id, { status: 'done', progress: 1, images: out.images, texts: out.texts, message: undefined });
  } catch (e) {
    if (ctrl.signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    updateJob(job.id, { status: 'error', message: msg });
    toast(msg, 'error');
  } finally {
    controllers.delete(job.id);
  }
}

/* ------------------------------ ComfyUI ------------------------------ */

async function toComfyInput(img: { url: string; w: number; h: number; ref?: JobImage['ref']; blob?: Blob }, name: string) {
  if (img.ref) return reuseOutputAsInput(img.ref);
  const blob = img.blob ?? (await toPngBlob(img.url, img.w, img.h));
  return uploadImage(blob, name);
}

/** The image on a white canvas, with room added around it: erased areas and the room come out white, which H3 Image is asked to fill. */
async function onWhite(url: string, pad = { left: 0, right: 0, top: 0, bottom: 0 }): Promise<Blob> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth + pad.left + pad.right;
  c.height = img.naturalHeight + pad.top + pad.bottom;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, pad.left, pad.top);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo preparar la imagen.'))), 'image/png'));
}

const FILL_ACTIONS: ActionKind[] = ['edit', 'zoom_out', 'pan'];

async function runComfy(job: Job, srcImg: JobImage | undefined, refs: JobRefs, signal: AbortSignal, mask?: string): Promise<{ images: JobImage[]; texts?: string[] }> {
  const c = getConfig();
  const inputs = { ...job.inputs };
  const custom = c.workflows[job.action];
  updateJob(job.id, { status: 'running', message: 'Subiendo imágenes…' }, false);

  // Put the images this job needs into ComfyUI's input folder.
  if (mask) inputs.image = await uploadImage(await onWhite(mask), `lumen_edit_${job.id}.png`);
  else if (srcImg && FILL_ACTIONS.includes(job.action) && !custom) {
    const pad = { left: inputs.pad_left ?? 0, right: inputs.pad_right ?? 0, top: inputs.pad_top ?? 0, bottom: inputs.pad_bottom ?? 0 };
    inputs.image = await uploadImage(await onWhite(srcImg.url, pad), `lumen_${job.id}.png`);
  } else if (srcImg) inputs.image = await toComfyInput(srcImg, `lumen_${job.id}.png`);
  inputs.images = await Promise.all((refs.images ?? []).map((r, n) => toComfyInput(r, `lumen_ip${n + 1}_${job.id}.png`)));
  inputs.style_images = await Promise.all((refs.style ?? []).map((r, n) => toComfyInput(r, `lumen_sref${n + 1}_${job.id}.png`)));
  inputs.picture_ratios = [...(refs.images ?? []), ...(refs.style ?? [])].map((r) => reducedRatio(r.w, r.h));
  if (!inputs.image) [inputs.image, inputs.image_2] = inputs.images;
  inputs.style_image = inputs.style_images[0];
  if (refs.end && !refs.loop) inputs.end_image = await toComfyInput(refs.end, `lumen_end_${job.id}.png`);
  const defs = await nodeDefs();

  const video = isVideoAction(job.action);
  updateJob(job.id, { inputs, message: 'En cola en ComfyUI…' }, false);

  // The grid (and each video) is one ComfyUI run after another, seeds counting up from the job's seed;
  // each result shows as soon as it is ready.
  // The enhancer writes the caption in the first run; the others reuse it, so the grid differs only by seed.
  const withCaption = !custom && enhanced(inputs);
  const runs = job.action === 'describe' ? 1 : inputs.batch;
  const images: JobImage[] = [];
  const texts: string[] = [];
  for (let n = 0; n < runs; n++) {
    const runInputs = { ...inputs, batch: job.action === 'describe' ? 4 : 1, seed: (inputs.seed + n) % 2 ** 32 };
    const { workflow } = buildWorkflow(runInputs, custom);
    checkWorkflow(workflow, defs);
    const label = runs > 1 ? `${n + 1}/${runs} · ` : '';
    const out = await runWorkflow(
      workflow,
      {
        onQueued: (promptId) => updateJob(job.id, { promptId }, false),
        onProgress: (p, text) => updateJob(job.id, { status: 'running', progress: (n + p) / runs, message: label + text }, false),
      },
      signal,
    );
    texts.push(...out.texts);
    if (job.action === 'describe') continue;
    if (n === 0 && out.titled.styles) updateJob(job.id, { styleList: out.titled.styles }, false);
    if (withCaption && !inputs.caption) {
      if (!out.titled.caption) throw new Error('El mejorador de prompt no escribió la descripción. Vuelve a intentarlo.');
      inputs.caption = out.titled.caption;
      updateJob(job.id, { inputs: { ...inputs } }, false);
    }
    if (!out.files.length) throw new Error(`El workflow terminó sin ${video ? 'vídeo' : 'imágenes'}. ¿Tiene un nodo que guarde el resultado (SaveImage, SaveAnimatedWEBP, SaveVideo…)?`);
    images.push(...(await toJobImages(out.files, runInputs, video, job.action === 'extend' ? (srcImg?.extended ?? 0) + 1 : undefined)));
    updateJob(job.id, { images: [...images] }, false);
  }
  if (job.action === 'describe') {
    if (!texts.length) throw new Error('El workflow de «Describir» no devolvió texto. Usa un nodo que muestre texto (ShowText, PreviewAny…).');
    return { images: [], texts: splitPrompts(texts) };
  }
  return { images };
}

async function toJobImages(files: ImageRef[], inputs: JobInputs, video: boolean, extended?: number): Promise<JobImage[]> {
  const sizes = await Promise.all(files.map((r) => (isVideoFile(r.filename) ? Promise.resolve({ w: 0, h: 0 }) : measure(viewUrl(r)))));
  return files.map((r, i) => ({
    url: viewUrl(r),
    ref: r,
    w: sizes[i].w || inputs.width,
    h: sizes[i].h || inputs.height,
    kind: video || isVideoFile(r.filename) ? 'video' : 'image',
    extended,
  }));
}

/** A captioner may return one long text or several: give four prompts when possible. */
function splitPrompts(texts: string[]): string[] {
  if (texts.length >= 2) return texts.slice(0, 4);
  const parts = texts[0].split(/\n\s*\n|\n(?=\d+[.)]\s)/).map((t) => t.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
  return (parts.length > 1 ? parts : texts).slice(0, 4);
}

function measure(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 0, h: 0 });
    img.src = url;
  });
}

/* ------------------------------ conversational mode ------------------------------ */

export const toggleConversational = () => set({ conversational: !state.conversational });
export const clearChat = () => set({ chat: [] }, false);
let chatBusy = false;

/** Your message → the assistant writes (or edits) the prompt and runs it. */
export async function sendToAssistant(message: string) {
  const text = message.trim();
  if (!text || chatBusy) return;
  chatBusy = true;
  const lastPromptTurn = [...state.chat].reverse().find((t) => t.role === 'assistant' && t.prompt);
  const lastJobsTurn = [...state.chat].reverse().find((t) => t.role === 'assistant' && t.jobIds?.length);
  const lastJob = lastJobsTurn ? state.jobs.find((j) => j.id === lastJobsTurn.jobIds![0]) : undefined;
  set({ chat: [...state.chat, { role: 'user', text }], draft: '' }, false);
  try {
    const cfg = getConfig();
    let result: AssistantResult;
    if (cfg.workflows.converse?.trim()) {
      // Your own LLM workflow: gets {{message}} and {{current_prompt}}, returns the prompt as text.
      const inputs = { ...baseInputs('converse', parsePrompt(text, state.settings), false), message: text, current_prompt: lastPromptTurn?.prompt ?? '' };
      const out = await runWorkflow(buildWorkflow(inputs, cfg.workflows.converse).workflow);
      const prompt = out.texts[0]?.trim();
      result = prompt ? { reply: 'Así lo he escrito y ya lo estoy creando:', prompt } : { reply: 'El workflow no devolvió texto.' };
    } else {
      result = assist(text, lastPromptTurn?.prompt, !!lastJob?.images.length);
    }
    let jobIds: string[] = [];
    if (result.imageAction && lastJob) {
      const { kind, index } = result.imageAction;
      if (!lastJob.images[index]) result = { reply: `La última creación solo tiene ${lastJob.images.length} imágenes.` };
      else jobIds = runAction(kind, { source: { jobId: lastJob.id, index }, ...(kind === 'animate' ? { prompt: lastJob.prompt } : {}) }).map((j) => j.id);
    } else if (result.prompt) {
      set({ draft: result.prompt }, false);
      jobIds = submitBar().map((j) => j.id);
    }
    set({ chat: [...state.chat, { role: 'assistant', text: result.reply, prompt: result.prompt, jobIds }] }, false);
  } catch (e) {
    set({ chat: [...state.chat, { role: 'assistant', text: e instanceof Error ? e.message : String(e) }] }, false);
  } finally {
    chatBusy = false;
  }
}

/* ------------------------------ repeat ------------------------------ */

/** "Repeat" button: same action, same source, new seed. */
export function rerunJob(job: Job, extraParams?: string): Job[] {
  const r = job.rerun ?? {};
  if (job.action === 'imagine' || job.action === 'image_prompt' || job.action === 'video' || (job.action === 'animate' && r.refs)) {
    return runAction(job.action, { prompt: job.rawPrompt, refs: r.refs, image: r.image, motion: r.motion, motionPrompt: r.motionPrompt, extraParams });
  }
  return runAction(job.action, {
    prompt: job.rawPrompt,
    source: job.parent,
    image: job.parent ? undefined : r.image,
    zoom: r.zoom,
    pan: r.pan,
    motion: r.motion,
    motionPrompt: r.motionPrompt,
    strength: r.strength,
    extraParams,
  });
}
