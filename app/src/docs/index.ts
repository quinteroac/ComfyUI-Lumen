// Lumen's documentation: English articles in ./articles/<slug>.md, grouped here by category.
// An article's first line is "# Title" and its first paragraph is the summary shown on cards and in search.
const files = import.meta.glob('./articles/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface Article {
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: Category;
}

export interface Category {
  id: string;
  title: string;
  description: string;
  articles: Article[];
}

const LAYOUT: { id: string; title: string; description: string; slugs: string[] }[] = [
  { id: 'getting-started', title: 'Getting Started', description: 'Your first images and a tour of Lumen.', slugs: ['quick-start', 'interface', 'imagine-bar', 'create-page', 'draft-mode', 'conversational-mode'] },
  { id: 'prompts', title: 'Prompts', description: 'Write prompts, weight their parts and start from pictures.', slugs: ['prompt-basics', 'multi-prompts', 'permutations', 'image-prompts', 'describe'] },
  { id: 'parameters', title: 'Parameters', description: 'Everything you can add after the prompt with --.', slugs: ['parameter-list', 'aspect-ratio', 'variety', 'seeds', 'repeat', 'resolution', 'models', 'tile'] },
  { id: 'styles', title: 'Styles & References', description: 'Style codes, character references, profiles and moodboards.', slugs: ['style-codes', 'style-explorer', 'style-creator', 'style-reference', 'character-reference', 'personalization', 'moodboards'] },
  { id: 'editing', title: 'Image Editing', description: 'Change, extend and redraw the images you made.', slugs: ['vary', 'upscale', 'remix', 'zoom-out', 'pan', 'editor', 'retexture'] },
  { id: 'video', title: 'Video', description: 'Videos with sound from text, images and references.', slugs: ['video-basics', 'animate', 'video-references', 'extend-video', 'upscale-video'] },
  { id: 'organize', title: 'Explore & Organize', description: 'Find, sort and keep your creations.', slugs: ['explore', 'organize', 'folders'] },
  { id: 'advanced', title: 'ComfyUI & Advanced', description: 'Models, settings, your own workflows and the MCP server.', slugs: ['how-lumen-works', 'comfyui-settings', 'custom-workflows', 'mcp-server'] },
];

function parse(slug: string, text: string, category: Category): Article {
  const lines = text.trim().split('\n');
  const title = lines[0].replace(/^#\s+/, '');
  const rest = lines.slice(1).join('\n').trim();
  const summary = rest.split(/\n\s*\n/)[0].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '');
  return { slug, title, summary, body: rest, category };
}

export const CATEGORIES: Category[] = LAYOUT.map(({ slugs, ...c }) => {
  const category: Category = { ...c, articles: [] };
  category.articles = slugs.map((slug) => {
    const text = files[`./articles/${slug}.md`];
    if (!text) throw new Error(`Missing docs article ${slug}.md`);
    return parse(slug, text, category);
  });
  return category;
});

export const ARTICLES: Article[] = CATEGORIES.flatMap((c) => c.articles);
export const articleOf = (slug: string) => ARTICLES.find((a) => a.slug === slug);
