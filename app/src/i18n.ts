// Lumen's languages. The Spanish text is the key; en, ja and zh translate it. The browser's language is used until
// one is picked in the menu, and changing it reloads the page (labels are read once when modules load).
import en from './locales/en.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

export const LANGS = { es: 'Español', en: 'English', ja: '日本語', zh: '中文' };
export type Lang = keyof typeof LANGS;

const DICTS: Partial<Record<Lang, Record<string, string>>> = { en, ja, zh };

function initial(): Lang {
  try {
    const saved = localStorage.getItem('lumen.lang');
    if (saved && saved in LANGS) return saved as Lang;
  } catch {
    // Storage can be blocked; the browser's language still applies.
  }
  const browser = navigator.language.slice(0, 2);
  return browser in LANGS ? (browser as Lang) : 'en';
}

export const lang = initial();
document.documentElement.lang = lang;
/** For dates and voice input: the browser's own variant when it is this language. */
export const locale = navigator.language.startsWith(lang) ? navigator.language : { es: 'es-ES', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[lang];
const dict = DICTS[lang] ?? {};

/** The text in the page's language; {name} takes vars.name. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const out = dict[text] || text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

export function setLang(next: Lang) {
  try {
    localStorage.setItem('lumen.lang', next);
  } catch {
    return;
  }
  location.reload();
}
