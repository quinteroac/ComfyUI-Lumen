// Style atoms for Personalize: the sample looks it shows and the profile words it learns from your picks.
import { hash } from './demo';

/* ------------------------------ style atoms ------------------------------ */

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
