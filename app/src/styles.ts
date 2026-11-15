// Style codes. Each code stands for a set of style words: with the built-in
// workflows "--sref <code>" adds those words to the prompt; custom workflows
// also receive the code as {{sref}}. Codes come from the Style Explorer
// presets or are made in the Style Creator (saved in the browser).
import { hash } from './demo';
import { save, saved } from './saved';

export interface StylePreset {
  code: string;
  name: string;
  words: string;
  tags: string[];
  custom?: boolean;
  createdAt?: number;
}

const RAW: [string, string, string[]][] = [
  ['Óleo dorado', 'oil painting, golden hour light, rich impasto brushstrokes', ['pintura', 'cálido']],
  ['Película 35 mm', 'analog 35mm film photo, soft grain, faded colors', ['fotográfico', 'vintage']],
  ['Acuarela suave', 'soft watercolor, bleeding pigments, paper texture', ['pintura', 'suave']],
  ['Neón nocturno', 'neon noir, rain reflections, cyan and magenta glow', ['cine', 'noche']],
  ['Grabado antiguo', 'vintage engraving, cross hatching, ink on parchment', ['ilustración', 'vintage']],
  ['Plano minimal', 'flat minimal illustration, bold shapes, limited palette', ['ilustración', 'minimal']],
  ['Pastel de ensueño', 'dreamy pastel colors, hazy diffuse light', ['suave', 'luz']],
  ['Cine épico', 'cinematic wide shot, volumetric fog, dramatic lighting', ['cine', 'épico']],
  ['Anime luminoso', 'anime key visual, cel shading, luminous sky', ['anime', 'color']],
  ['Papel recortado', 'layered paper cut art, soft shadows, handmade', ['artesanal', 'textura']],
  ['Ukiyo-e', 'woodblock print, flat color areas, fine outlines', ['grabado', 'tradicional']],
  ['Cerámica esmaltada', 'glazed ceramic sculpture, glossy highlights', ['3d', 'textura']],
  ['Retrato de estudio', 'studio portrait photography, softbox lighting, 85mm', ['fotográfico', 'retrato']],
  ['Ciencia ficción retro', 'retro futurism, 1970s sci-fi paperback cover', ['vintage', 'ciencia ficción']],
  ['Carboncillo', 'charcoal sketch, smudged shading, expressive lines', ['dibujo', 'monocromo']],
  ['Isométrico', 'isometric 3d render, clay materials, tiny world', ['3d', 'juego']],
  ['Vidriera', 'stained glass, bold lead lines, jewel tones', ['decorativo', 'color']],
  ['Bruma nórdica', 'nordic landscape, cold mist, muted blues', ['paisaje', 'frío']],
  ['Pop art', 'pop art, halftone dots, bold primary colors', ['color', 'gráfico']],
  ['Tinta china', 'sumi-e ink wash, negative space, single brush', ['tradicional', 'monocromo']],
  ['Bordado', 'embroidered textile, colorful thread, stitched texture', ['artesanal', 'textura']],
  ['Polaroid', 'instant photo, washed colors, white frame look', ['fotográfico', 'vintage']],
  ['Art déco', 'art deco poster, geometric ornament, gold and black', ['decorativo', 'gráfico']],
  ['Surrealismo', 'surreal dreamscape, impossible architecture, soft shadows', ['onírico', 'arte']],
];

export const codeFor = (seed: string) => String(1000000 + (hash(seed) % 8999999));

export const STYLE_PRESETS: StylePreset[] = RAW.map(([name, words, tags]) => ({ code: codeFor(name), name, words, tags }));

/* ------------------------------ custom styles (Style Creator) ------------------------------ */

let custom: StylePreset[] = saved<StylePreset[]>('styles') ?? [];

export function customStyles(): StylePreset[] {
  return custom;
}

export function allStyles(): StylePreset[] {
  return [...custom, ...STYLE_PRESETS];
}

/** Saves a style made in the Style Creator and returns its code. */
export function registerStyle(words: string, name: string): StylePreset {
  const code = codeFor(`custom:${words}`);
  const existing = custom.find((s) => s.code === code);
  if (existing) return existing;
  const s: StylePreset = { code, name, words, tags: ['creado por ti'], custom: true, createdAt: Date.now() };
  custom = [s, ...custom];
  save('styles', custom);
  return s;
}

export function styleByCode(code: string): StylePreset | undefined {
  const c = code.trim();
  return STYLE_PRESETS.find((s) => s.code === c) ?? custom.find((s) => s.code === c);
}

/* ------------------------------ style atoms (Style Creator samples) ------------------------------ */

export type AtomGroup = 'medium' | 'light' | 'palette' | 'texture' | 'mood';

export const ATOMS: Record<AtomGroup, string[]> = {
  medium: [
    'oil painting',
    'watercolor',
    'gouache illustration',
    'analog film photo',
    'digital matte painting',
    'charcoal drawing',
    'linocut print',
    'claymation 3d render',
    'anime cel shading',
    'collage of cut paper',
    'pixel art',
    'ink wash',
  ],
  light: ['golden hour light', 'soft overcast light', 'hard noon shadows', 'neon glow', 'candlelight', 'misty backlight', 'studio softbox', 'moonlight'],
  palette: [
    'muted earth tones',
    'vivid primary colors',
    'pastel palette',
    'teal and orange',
    'monochrome blue',
    'black and gold',
    'faded vintage colors',
    'high contrast black and white',
  ],
  texture: ['heavy grain', 'smooth gradients', 'visible brushstrokes', 'halftone dots', 'paper texture', 'crisp clean lines', 'glossy surfaces', 'rough sketchy marks'],
  mood: ['dreamy', 'melancholic', 'playful', 'epic', 'serene', 'eerie', 'nostalgic', 'energetic'],
};

export const ATOM_GROUPS = Object.keys(ATOMS) as AtomGroup[];

export interface Sample {
  id: string;
  atoms: Record<AtomGroup, string>;
  words: string;
}

/** Picks a sample style; atoms with higher scores are more likely (with some exploration). */
export function makeSample(scores: Record<string, number>, rand: () => number, n: number): Sample {
  const atoms = {} as Record<AtomGroup, string>;
  for (const g of ATOM_GROUPS) {
    const opts = ATOMS[g];
    if (rand() < 0.3) {
      atoms[g] = opts[Math.floor(rand() * opts.length)];
      continue;
    }
    const weights = opts.map((a) => Math.exp(Math.max(-3, Math.min(4, scores[a] ?? 0))));
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    let pick = opts[0];
    for (let i = 0; i < opts.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = opts[i];
        break;
      }
    }
    atoms[g] = pick;
  }
  const words = ATOM_GROUPS.map((g) => atoms[g]).join(', ');
  return { id: `s${n}-${hash(words)}`, atoms, words };
}

/** Style atoms suggested by words in a prompt (used when you like Explore images). */
const TEXT_TO_ATOMS: [RegExp, string[]][] = [
  [/óleo|oil/i, ['oil painting', 'visible brushstrokes']],
  [/acuarela|watercolou?r/i, ['watercolor', 'paper texture']],
  [/anal[oó]gic|film|grano/i, ['analog film photo', 'heavy grain']],
  [/minimal|planos|flat/i, ['gouache illustration', 'crisp clean lines']],
  [/cinemat|niebla|fog/i, ['digital matte painting', 'misty backlight', 'epic']],
  [/grabado|engrav|vintage/i, ['linocut print', 'faded vintage colors', 'nostalgic']],
  [/alto contraste|contrast/i, ['high contrast black and white', 'energetic']],
  [/pastel/i, ['pastel palette', 'dreamy']],
  [/dorad|golden/i, ['golden hour light']],
  [/difus|soft light|suave/i, ['soft overcast light', 'serene']],
  [/ne[oó]n/i, ['neon glow']],
  [/noche|night|luna|moon/i, ['moonlight', 'melancholic']],
];

export function atomsFromText(text: string): string[] {
  return [...new Set(TEXT_TO_ATOMS.filter(([re]) => re.test(text)).flatMap(([, a]) => a))];
}

/** The style learned so far: the best-scoring atom of each group (only groups with a clear preference). */
export function learnedWords(scores: Record<string, number>): string {
  const out: string[] = [];
  for (const g of ATOM_GROUPS) {
    const best = [...ATOMS[g]].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0];
    if ((scores[best] ?? 0) > 0.5) out.push(best);
  }
  return out.join(', ');
}
