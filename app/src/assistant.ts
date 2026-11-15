// Conversational mode, built in: turns what you say into a prompt, and follow-up
// messages into edits of that prompt ("hazlo de noche", "sin personas", "en
// vertical", "cambia el gato por un perro", "variación de la imagen 2").
// Runs in the browser with simple language rules; a ComfyUI workflow with an
// LLM can replace it (Ajustes de ComfyUI → «Modo conversacional»).
import { hash } from './images';

export type ImageAction = 'vary_subtle' | 'vary_strong' | 'upscale_subtle' | 'animate';

export interface AssistantResult {
  reply: string;
  /** New prompt to run (body + parameters). */
  prompt?: string;
  /** Act on an image of the last result ("imagen 2" → index 1). */
  imageAction?: { kind: ImageAction; index: number };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function split(prompt: string) {
  const i = prompt.search(/(^|\s)--[a-z]/i);
  const body = (i >= 0 ? prompt.slice(0, i) : prompt).trim();
  const params = i >= 0 ? prompt.slice(i).trim() : '';
  return { body, params };
}

function setParam(params: string, key: string, value: string) {
  const re = new RegExp(`--${key}\\b[^-]*`, 'i');
  const tok = `--${key} ${value}`.trim();
  return re.test(params) ? params.replace(re, `${tok} `).trim() : `${params} ${tok}`.trim();
}

const ENRICH = [
  'rich detail, soft natural light',
  'cinematic composition, atmospheric lighting',
  'beautiful color harmony, gentle depth of field',
  'striking composition, golden hour glow',
  'dreamy atmosphere, subtle textures',
];
const STYLE_HINT = /(estilo|style|foto|photo|pintura|painting|acuarela|watercolor|ilustraci|illustration|render|anime|luz|light|cinemat|oleo|oil|dibujo|sketch|3d)/;

const FILLER =
  /^(por favor,?\s*)?(quiero( ver)?|me gustaria( ver)?|me encantaria( ver)?|imagina|imaginate|dibuja(me)?|crea(me)?|genera(me)?|haz(me)?|muestrame|ensename|i want( to see)?|i'?d like( to see)?|draw( me)?|create|make( me)?|generate|show me|imagine|can you (make|draw|create))\s+/;
const IMAGE_OF = /^(una?s? )?(imagen|imagenes|foto|fotos|ilustracion|dibujo|picture|image|photo|illustration|drawing)( de| of)?\s+/;

function cleanIdea(text: string) {
  let t = text.trim().replace(/[.!?¡¿]+$/g, '');
  for (let i = 0; i < 2; i++) {
    t = t.replace(new RegExp(FILLER.source, 'i'), '').replace(new RegExp(IMAGE_OF.source, 'i'), '');
  }
  return t.trim();
}

const NEW_IDEA = /^(ahora |now )?(otra cosa|otra idea|algo (distinto|diferente|nuevo)|empieza de nuevo|start over|something else|new idea|otr[oa] |nuev[oa] |another |a new )/;
const MODIFY =
  /^(hazl[oa]|hazla|que sea|que tenga|que haya|ponle|pon|anade|agrega|incluye|add|make it|make the|more|mas |menos |less |but |pero |sin |without |quita|elimina|remove|cambia|change|reemplaza|replace|ahora|now|en vertical|en horizontal|vertical|horizontal|cuadrad|con |with |de noche|de dia|at night|in the )/;

export function assist(message: string, current: string | undefined, hasImages: boolean): AssistantResult {
  const raw = message.trim();
  const n = norm(raw);

  // "variación de la imagen 2", "amplía la 3", "anima la imagen 1"
  const img = n.match(/(?:imagen|image|foto|picture|la|the|numero|number|#)\s*(\d)\b/);
  if (img && hasImages) {
    const index = Number(img[1]) - 1;
    let kind: ImageAction | undefined;
    if (/(variac|varia|variation|vary|version|parecid)/.test(n)) kind = /(fuerte|strong|muy diferente|mas diferente|bold)/.test(n) ? 'vary_strong' : 'vary_subtle';
    else if (/(amplia|upscale|agranda|mas grande|bigger|aumenta)/.test(n)) kind = 'upscale_subtle';
    else if (/(anima|animate|video|movimiento|motion)/.test(n)) kind = 'animate';
    else if (/(me gusta|like|esa|that one|usa|use|mejora|enhance)/.test(n)) kind = 'vary_subtle';
    if (kind) {
      const what = { vary_subtle: 'una variación sutil', vary_strong: 'una variación fuerte', upscale_subtle: 'una ampliación', animate: 'un vídeo' }[kind];
      return { reply: `Hago ${what} de la imagen ${index + 1}.`, imageAction: { kind, index } };
    }
  }

  const isModify = !!current && !NEW_IDEA.test(n) && (MODIFY.test(n) || raw.split(/\s+/).length <= 3);
  if (!current || !isModify) {
    const fresh = NEW_IDEA.test(n) ? raw.slice(n.match(NEW_IDEA)![0].length) : raw;
    const idea = cleanIdea(fresh.replace(/^[\s:,.;-]+/, ''));
    const { body, params } = split(idea);
    if (!body) return { reply: 'Cuéntame qué te gustaría ver: un lugar, un personaje, una escena…' };
    const enrich = STYLE_HINT.test(norm(body)) ? '' : `, ${ENRICH[hash(body) % ENRICH.length]}`;
    const prompt = `${body}${enrich}${params ? ` ${params}` : ''}`;
    return { reply: 'Así lo he escrito y ya lo estoy creando:', prompt };
  }

  // Edits to the current prompt.
  let { body, params } = split(current);
  const changes: string[] = [];
  let rest = raw;

  if (/(vertical|retrato|portrait|tall)/.test(n)) {
    params = setParam(params, 'ar', '2:3');
    changes.push('formato vertical');
  } else if (/(horizontal|panoramic|apaisad|landscape|wide|ancho)/.test(n)) {
    params = setParam(params, 'ar', '16:9');
    changes.push('formato horizontal');
  } else if (/(cuadrad|square)/.test(n)) {
    params = setParam(params, 'ar', '1:1');
    changes.push('formato cuadrado');
  }
  rest = rest.replace(/\b(en )?(formato )?(vertical|horizontal|cuadrad[oa]|retrato|panor[aá]mic[oa]|portrait|landscape|square|wide)\b/gi, '').trim();

  const swap = rest.match(/(?:cambia|change|reemplaza|replace|sustituye)\s+(?:el |la |los |las |the )?(.+?)\s+(?:por|to|with|for)\s+(?:un |una |unos |unas |a |an )?(.+)/i);
  if (swap) {
    const re = new RegExp(swap[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    body = re.test(body) ? body.replace(re, swap[2]) : `${body}, ${swap[2]}`;
    changes.push(`«${swap[1]}» → «${swap[2]}»`);
    rest = '';
  }

  const neg = rest.match(/^(?:pero |but )?(?:sin|without|quita(?:le)?|elimina|remove|no quiero|ningun[oa]?|no)\s+(?:el |la |los |las |the |any )?(.+)/i);
  if (neg) {
    const what = neg[1].replace(/[.!]+$/, '').trim();
    body = body.replace(new RegExp(`,?\\s*${what.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '');
    changes.push(`sin ${what}`);
    rest = '';
  }

  if (/\b(raw|realista|realistic|fotorrealista|photorealistic)\b/.test(n)) {
    body = `${body}, photorealistic`;
    changes.push('más realista');
    rest = rest.replace(/(^|\s)(m[aá]s\s+|more\s+)?(realista|realistic|fotorrealista|photorealistic)\b/gi, ' ').trim();
  }

  const extra = rest
    .replace(/^(pero |but |y |and |ahora |now |tambi[eé]n |also )+/i, '')
    .replace(/^(m[aá]s|more|menos|less)$/i, '')
    .replace(/^(hazl[oa]|hazla|que sea|que tenga|que haya|ponle|pon|añade|anade|agrega|incluye|add|make it|make the|make)\s+/i, '')
    .replace(/^(mas|más)\s+/i, 'more ')
    .replace(/^(menos)\s+/i, 'less ')
    .replace(/[.!]+$/, '')
    .trim();
  if (extra) {
    body = `${body}, ${extra}`;
    changes.push(extra);
  }
  if (!changes.length) return { reply: 'No he entendido qué cambiar. Prueba con «hazlo de noche», «sin personas», «en vertical» o «cambia X por Y».' };
  const prompt = `${body.replace(/\s*,\s*,/g, ',').trim()}${params ? ` ${params}` : ''}`;
  return { reply: `Cambiado: ${changes.join(' · ')}.`, prompt };
}
