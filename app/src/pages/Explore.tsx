import { useEffect, useMemo, useState } from 'react';
import { artUrl, hash } from '../demo';
import { IconCopy, IconHeart, IconImage, IconSearch } from '../icons';
import { openLightbox, type LbItem } from '../lightbox';
import { addRef, getState, imageToRef, runAction, setDraft, toast, toggleExploreLike, toggleStyleLike, useStore } from '../store';
import { Media, VideoBadge } from '../components/Media';
import { navigate, useQueryParam } from '../router';
import { STYLE_PRESETS, allStyles, type StylePreset } from '../styles';

const SUBJECTS = [
  'un faro solitario bajo una aurora violeta',
  'retrato de una astronauta con flores en el casco',
  'ciudad flotante entre nubes al atardecer',
  'bosque de cristal iluminado por luciérnagas',
  'zorro de papel origami en la nieve',
  'mercado nocturno con farolillos de neón',
  'ballena volando sobre un desierto rosa',
  'biblioteca infinita con escaleras en espiral',
  'jardín japonés en miniatura dentro de una botella',
  'tren de vapor cruzando montañas de colores',
  'cafetería acogedora en un día de lluvia',
  'templo antiguo cubierto de musgo',
  'gato samurái meditando bajo cerezos',
  'arrecife de coral con medusas brillantes',
  'casa en un árbol gigante al amanecer',
  'paisaje lunar con dos soles',
  'bailarina hecha de humo y luz',
  'isla flotante con cascadas',
  'robot jardinero cuidando girasoles',
  'catedral gótica de hielo',
];
const STYLES = [
  'pintura al óleo, luz dorada',
  'fotografía analógica, grano de película',
  'ilustración minimalista, colores planos',
  'acuarela suave',
  'render cinematográfico, niebla volumétrica',
  'estilo grabado vintage',
  'arte digital, alto contraste',
  'pastel, luz difusa',
];
const RATIOS: [number, number][] = [
  [1, 1],
  [2, 3],
  [3, 2],
  [4, 5],
  [9, 16],
  [16, 9],
  [3, 4],
];

interface ExploreItem extends LbItem {
  exploreId: string;
  /** Days ago. */
  age: number;
  likes: number;
}

function buildVideos(): ExploreItem[] {
  return Array.from({ length: 16 }, (_, i) => {
    const subject = SUBJECTS[(i * 11 + 3) % SUBJECTS.length];
    const style = STYLES[(i * 5 + 1) % STYLES.length];
    const [a, b] = ([[16, 9], [9, 16], [1, 1], [4, 5]] as [number, number][])[i % 4];
    const w = Math.round((576 * Math.sqrt(a / b)) / 16) * 16;
    const h = Math.round((576 * Math.sqrt(b / a)) / 16) * 16;
    const motion = i % 3 === 0 ? 'high' : 'low';
    const key = hash(subject + style + 'v');
    const layers = [{ seed: i * 977 + 3, jitter: 1 }];
    return {
      exploreId: `v${i}`,
      prompt: `${subject}, ${style} --motion ${motion}`,
      age: (i * 5) % 31,
      likes: (hash(`v${i}`) % 900) + 20,
      meta: [`${a}:${b}`, 'vídeo', motion === 'high' ? 'movimiento alto' : 'movimiento bajo'],
      img: { url: artUrl({ key, layers, w, h, motion }), w, h, kind: 'video' as const, demo: { key, layers, motion } },
    };
  });
}

function buildGallery(): ExploreItem[] {
  return Array.from({ length: 40 }, (_, i) => {
    const subject = SUBJECTS[(i * 7) % SUBJECTS.length];
    const style = STYLES[(i * 3) % STYLES.length];
    const [a, b] = RATIOS[(i * 5 + 2) % RATIOS.length];
    const w = Math.round((1024 * Math.sqrt(a / b)) / 64) * 64;
    const h = Math.round((1024 * Math.sqrt(b / a)) / 64) * 64;
    const key = hash(subject + style);
    const layers = [{ seed: i * 131 + 7, jitter: 1 }];
    return {
      exploreId: `e${i}`,
      prompt: `${subject}, ${style} --ar ${a}:${b}`,
      age: (i * 3) % 31,
      likes: (hash(`e${i}`) % 2000) + 10,
      meta: [`${a}:${b}`, 'galería'],
      img: { url: artUrl({ key, layers, w, h }), w, h, demo: { key, layers } },
    };
  });
}

type View = 'foryou' | 'random' | 'hot' | 'top' | 'likes';
type Kind = 'images' | 'videos' | 'styles';
type Period = 'day' | 'week' | 'month';

const words = (t: string) => t.toLowerCase().replace(/--\S+(\s+\S+)?/g, ' ').split(/[^a-záéíóúñü]+/).filter((w) => w.length > 3);

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Tile({ it, items, i }: { it: ExploreItem; items: ExploreItem[]; i: number }) {
  const liked = useStore((s) => s.likedExplore.includes(it.exploreId));
  return (
    <div className="tile" role="button" tabIndex={0} onClick={() => openLightbox(items, i)} onKeyDown={(e) => e.key === 'Enter' && openLightbox(items, i)}>
      <Media img={it.img} alt={it.prompt} />
      {it.img.kind === 'video' && <VideoBadge />}
      <div className="tile-info">{it.prompt}</div>
      <div className="tile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="icon-btn"
          aria-label="Usar como prompt de imagen"
          title="Usar imagen"
          onClick={() => {
            addRef('images', imageToRef(it.img));
            toast('Añadida como prompt de imagen');
          }}
        >
          <IconImage size={16} />
        </button>
        <button
          className="icon-btn"
          aria-label="Usar prompt"
          title="Usar prompt"
          onClick={() => {
            setDraft(it.prompt);
            toast('Prompt copiado en la barra');
          }}
        >
          <IconCopy size={16} />
        </button>
        <button className="icon-btn" aria-label="Buscar parecidas" title="Buscar parecidas" onClick={() => navigate('explore', { q: words(it.prompt).slice(0, 2).join(' ') })}>
          <IconSearch size={16} />
        </button>
        <button className={`icon-btn${liked ? ' on' : ''}`} aria-label={liked ? 'Quitar me gusta' : 'Me gusta'} onClick={() => toggleExploreLike(it.exploreId, it.prompt)}>
          <IconHeart size={16} filled={liked} />
        </button>
      </div>
    </div>
  );
}

function styleSample(s: StylePreset, n: number) {
  const key = hash(s.code);
  return artUrl({ key, layers: [{ seed: n * 7919 + 11, jitter: 1 }], w: 512, h: n % 2 ? 640 : 512 });
}

/** Style Explorer: style codes you can try, copy (--sref) and like. */
function Styles({ q }: { q: string }) {
  const liked = useStore((s) => s.likedStyles);
  const [sort, setSort] = useState<'random' | 'popular' | 'likes'>('popular');
  const [open, setOpen] = useState<StylePreset | null>(null);
  const [seed] = useState(() => Date.now() % 100000);
  const list = useMemo(() => {
    // Your own styles (Style Creator) only show under "Me gusta" once liked.
    let l = sort === 'likes' ? allStyles() : STYLE_PRESETS;
    if (sort === 'random') l = shuffle(l, seed);
    if (sort === 'popular') l = [...l].sort((a, b) => (hash(b.code) % 997) - (hash(a.code) % 997));
    if (sort === 'likes') l = l.filter((s) => liked.includes(s.code));
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((s) => (s.name + ' ' + s.words + ' ' + s.tags.join(' ')).toLowerCase().includes(t));
    return l;
  }, [sort, seed, q, liked]);

  const tryStyle = (s: StylePreset) => {
    const st = getState();
    const base = st.draft.trim() || st.jobs.find((j) => j.action === 'imagine')?.rawPrompt.replace(/\s--sref\s+\S+/g, '') || 'un paisaje sereno';
    const jobs = runAction('imagine', { prompt: `${base} --sref ${s.code}` });
    if (jobs.length) navigate('imagine');
  };
  const copy = (s: StylePreset) => {
    const d = getState().draft.replace(/\s--sref\s+\S+/g, '').trim();
    setDraft(`${d} --sref ${s.code}`.trim());
    toast(`--sref ${s.code} añadido a la barra`);
  };

  return (
    <>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ['popular', 'Populares'],
            ['random', 'Aleatorios'],
            ['likes', 'Me gusta'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`tab${sort === k ? ' on' : ''}`} onClick={() => setSort(k)}>
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <h2>Sin estilos</h2>
          <p>{sort === 'likes' ? 'Pulsa el corazón en un estilo para guardarlo aquí.' : 'Prueba otra búsqueda.'}</p>
        </div>
      ) : (
        <div className="styles-grid">
          {list.map((s) => (
            <div key={s.code} className="style-card" role="button" tabIndex={0} onClick={() => setOpen(s)} onKeyDown={(e) => e.key === 'Enter' && setOpen(s)}>
              <div className="style-thumbs">
                {[0, 1, 2].map((n) => (
                  <img key={n} src={styleSample(s, n)} alt="" loading="lazy" />
                ))}
              </div>
              <div className="style-name">
                <strong>{s.name}</strong>
                <span>--sref {s.code}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="lightbox style-modal" role="dialog" aria-modal="true" aria-label={`Estilo ${open.name}`} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="style-detail">
            <div className="lb-top">
              <div>
                <h2>{open.name}</h2>
                <p className="hint">
                  --sref {open.code} · {open.words}
                </p>
              </div>
              <button className="icon-btn" aria-label="Cerrar" onClick={() => setOpen(null)}>
                ✕
              </button>
            </div>
            <div className="style-gallery">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <img key={n} src={styleSample(open, n)} alt={`Ejemplo ${n + 1} del estilo ${open.name}`} />
              ))}
            </div>
            <div className="row">
              <button className="btn primary" data-action="imagine" onClick={() => tryStyle(open)}>
                Probar estilo
              </button>
              <button className="btn" onClick={() => copy(open)}>
                Copiar --sref
              </button>
              <button className={`btn${liked.includes(open.code) ? ' primary' : ''}`} onClick={() => toggleStyleLike(open.code)}>
                <IconHeart size={15} filled={liked.includes(open.code)} /> Me gusta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Explore() {
  const gallery = useMemo(buildGallery, []);
  const videos = useMemo(buildVideos, []);
  const liked = useStore((s) => s.likedExplore);
  const myJobs = useStore((s) => s.jobs);
  const urlQ = useQueryParam('q');
  const [view, setView] = useState<View>('foryou');
  const [kind, setKind] = useState<Kind>('images');
  const [period, setPeriod] = useState<Period>('week');
  const [q, setQ] = useState(urlQ);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  useEffect(() => setQ(urlQ), [urlQ]);

  const items = useMemo(() => {
    const pool = kind === 'videos' ? videos : gallery;
    let list = pool;
    if (view === 'foryou') {
      // Based on what you like and create.
      const taste = new Set([...pool.filter((g) => liked.includes(g.exploreId)).flatMap((g) => words(g.prompt)), ...myJobs.slice(0, 30).flatMap((j) => words(j.prompt))]);
      list = [...pool].sort((a, b) => words(b.prompt).filter((w) => taste.has(w)).length - words(a.prompt).filter((w) => taste.has(w)).length || b.likes - a.likes);
    } else if (view === 'random') list = shuffle(pool, seed);
    else if (view === 'hot') list = [...pool].sort((a, b) => b.likes / (b.age + 2) - a.likes / (a.age + 2));
    else if (view === 'top') list = pool.filter((g) => g.age <= { day: 1, week: 7, month: 31 }[period]).sort((a, b) => b.likes - a.likes);
    else if (view === 'likes') list = [...gallery, ...videos].filter((g) => liked.includes(g.exploreId));
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((g) => t.split(/\s+/).every((w) => g.prompt.toLowerCase().includes(w)));
    return list;
  }, [gallery, videos, kind, view, period, seed, q, liked, myJobs]);

  return (
    <section aria-label="Explorar">
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Vista">
          {kind !== 'styles' &&
            (
              [
                ['foryou', 'Para ti'],
                ['random', 'Aleatorio'],
                ['hot', 'En tendencia'],
                ['top', 'Top'],
                ['likes', 'Me gusta'],
              ] as [View, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={view === k}
                className={`tab${view === k ? ' on' : ''}`}
                onClick={() => {
                  setView(k);
                  if (k === 'random') setSeed(Date.now() % 100000);
                }}
              >
                {label}
              </button>
            ))}
          {kind !== 'styles' && view === 'top' && (
            <select className="select-small" value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Periodo">
              <option value="day">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
            </select>
          )}
        </div>
        <div className="row">
          <label className="search">
            <IconSearch size={16} />
            <input type="search" placeholder={kind === 'styles' ? 'Buscar estilos' : 'Buscar'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          </label>
          <div className="tabs" role="tablist" aria-label="Tipo">
            {(
              [
                ['images', 'Imágenes'],
                ['videos', 'Vídeos'],
                ['styles', 'Estilos'],
              ] as [Kind, string][]
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={kind === k} className={`tab${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {kind === 'styles' ? (
        <Styles q={q} />
      ) : items.length === 0 ? (
        <div className="empty">
          <h2>{view === 'likes' ? 'Aún no te gusta nada' : 'Sin resultados'}</h2>
          <p>{view === 'likes' ? 'Pulsa el corazón en cualquier imagen o vídeo para guardarlo aquí.' : 'Prueba con otras palabras u otro periodo.'}</p>
        </div>
      ) : (
        <div className="masonry">
          {items.map((it, i) => (
            <Tile key={it.exploreId} it={it} items={items} i={i} />
          ))}
        </div>
      )}
    </section>
  );
}
