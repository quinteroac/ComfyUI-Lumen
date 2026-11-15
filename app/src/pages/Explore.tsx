import { useEffect, useMemo, useState } from 'react';
import { IconCopy, IconHeart, IconImage, IconSearch } from '../icons';
import { openLightbox, type LbItem } from '../lightbox';
import { addRef, getState, imageToRef, runAction, setDraft, toast, toggleLike, toggleStyleLike, useStore } from '../store';
import { jobItems } from './Create';
import { Media, VideoBadge } from '../components/Media';
import { navigate, useQueryParam } from '../router';
import { previewKey, randomCode, requestPreview, styleLabels, styleTitle, usePreviews, type StylePreview } from '../stylePreviews';
import { useConfig } from '../useConfig';
import type { Job } from '../comfy/types';
import { t } from '../i18n';

type View = 'recent' | 'random' | 'likes';
type Kind = 'images' | 'videos' | 'styles';

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

/** Every finished image or video of yours, newest first, with what the lightbox needs to act on it. */
function myItems(jobs: Job[]): (LbItem & { key: string; createdAt: number })[] {
  return jobs
    .filter((j) => j.status === 'done' && j.action !== 'describe')
    .flatMap((job) => jobItems(job).map((it) => ({ ...it, prompt: job.rawPrompt || job.prompt, key: `${job.id}:${it.index}`, createdAt: job.createdAt })));
}

function Tile({ it, items, i }: { it: LbItem; items: LbItem[]; i: number }) {
  const liked = !!it.img.liked;
  return (
    <div className="tile" role="button" tabIndex={0} onClick={() => openLightbox(items, i)} onKeyDown={(e) => e.key === 'Enter' && openLightbox(items, i)}>
      <Media img={it.img} alt={it.prompt} />
      {it.img.kind === 'video' && <VideoBadge />}
      <div className="tile-info">{it.prompt}</div>
      <div className="tile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="icon-btn"
          aria-label={t('Usar como prompt de imagen')}
          title={t('Usar imagen')}
          onClick={() => {
            addRef('images', imageToRef(it.img));
            toast(t('Añadida como prompt de imagen'));
          }}
        >
          <IconImage size={16} />
        </button>
        <button
          className="icon-btn"
          aria-label={t('Usar prompt')}
          title={t('Usar prompt')}
          onClick={() => {
            setDraft(it.prompt);
            toast(t('Prompt copiado en la barra'));
          }}
        >
          <IconCopy size={16} />
        </button>
        <button className="icon-btn" aria-label={t('Buscar parecidas')} title={t('Buscar parecidas')} onClick={() => navigate('explore', { q: words(it.prompt).slice(0, 2).join(' ') })}>
          <IconSearch size={16} />
        </button>
        <button className={`icon-btn${liked ? ' on' : ''}`} aria-label={liked ? t('Quitar me gusta') : t('Me gusta')} onClick={() => it.jobId && toggleLike(it.jobId, it.index ?? 0)}>
          <IconHeart size={16} filled={liked} />
        </button>
      </div>
    </div>
  );
}

/** Codes in your jobs' --sref, newest first. */
function usedCodes(jobs: Job[]): string[] {
  return [...new Set(jobs.flatMap((j) => (j.inputs.sref ?? '').split(/[\s,]+/).map((t) => t.split('::')[0]).filter((t) => /^\d+$/.test(t))))];
}

function StyleThumb({ p, code }: { p?: StylePreview; code: string }) {
  if (p?.status === 'done' && p.image) return <Media img={p.image} alt={`Estilo --sref ${code}`} />;
  return <div className="placeholder style-pending">{p?.status === 'error' ? t('Error') : p?.status === 'running' ? t('Generando…') : t('En cola')}</div>;
}

/** Style Explorer: --sref codes with a real preview (the preview prompt from the ComfyUI page), to try, copy and like. */
function Styles({ q }: { q: string }) {
  const liked = useStore((s) => s.likedStyles);
  const jobs = useStore((s) => s.jobs);
  const previews = usePreviews();
  const prompt = useConfig().styleCodes.previewPrompt;
  const [tab, setTab] = useState<'discover' | 'likes' | 'used'>('discover');
  const [open, setOpen] = useState<string | null>(null);
  const preview = (code: string) => previews[previewKey(code, prompt)];

  const codes = useMemo(() => {
    let l =
      tab === 'likes'
        ? [...liked].reverse()
        : tab === 'used'
          ? usedCodes(jobs)
          : Object.values(previews)
              .filter((p) => p.prompt === prompt)
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((p) => p.code);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((c) => c.includes(t) || (preview(c)?.styles ?? '').toLowerCase().includes(t));
    return l;
  }, [tab, liked, jobs, previews, prompt, q]);

  // Liked and used codes get their preview when they are shown.
  useEffect(() => {
    if (tab !== 'discover') codes.forEach((c) => requestPreview(c, prompt));
  }, [tab, codes, prompt]);

  const discover = () => Array.from({ length: 8 }, randomCode).forEach((c) => requestPreview(c, prompt));
  const tryStyle = (code: string) => {
    const st = getState();
    const base = st.draft.trim() || st.jobs.find((j) => j.action === 'imagine')?.rawPrompt || prompt;
    const jobs = runAction('imagine', { prompt: `${base.replace(/\s--sref(\s+[^-\s]+)+/g, '')} --sref ${code}` });
    if (jobs.length) navigate('imagine');
  };
  const copy = (code: string) => {
    const d = getState().draft.replace(/\s--sref(\s+[^-\s]+)+/g, '').trim();
    setDraft(`${d} --sref ${code}`.trim());
    toast(t('--sref {code} añadido a la barra', { code }));
  };
  const shown = open ? preview(open) : undefined;

  return (
    <>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ['discover', t('Descubrir')],
            ['likes', t('Me gusta')],
            ['used', t('Usados')],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
        {tab === 'discover' && (
          <button className="btn small primary" onClick={discover} title={t('Genera vistas previas de 8 códigos al azar')}>
            {t('Descubrir 8 estilos')}
          </button>
        )}
      </div>
      {codes.length === 0 ? (
        <div className="empty">
          <h2>{t('Sin estilos')}</h2>
          <p>
            {tab === 'likes'
              ? t('Pulsa el corazón en un estilo para guardarlo aquí.')
              : tab === 'used'
                ? t('Los códigos --sref de tus creaciones aparecerán aquí.')
                : q
                  ? t('Prueba otra búsqueda.')
                  : t('Pulsa «Descubrir 8 estilos»: cada código se genera con el prompt de vista previa (página ComfyUI).')}
          </p>
        </div>
      ) : (
        <div className="styles-grid">
          {codes.map((code) => (
            <div key={code} className="style-card" role="button" tabIndex={0} onClick={() => setOpen(code)} onKeyDown={(e) => e.key === 'Enter' && setOpen(code)}>
              <div className="style-thumbs single">
                <StyleThumb p={preview(code)} code={code} />
              </div>
              <div className="style-name">
                <strong>{styleTitle(preview(code)?.styles) || t('Estilo')}</strong>
                <span>{t('--sref {code}', { code })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="lightbox style-modal" role="dialog" aria-modal="true" aria-label={`Estilo --sref ${open}`} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="style-detail">
            <div className="lb-top">
              <div>
                <h2>{styleTitle(shown?.styles) || `--sref ${open}`}</h2>
                <p className="hint">{t('--sref {open}', { open })}</p>
              </div>
              <button className="icon-btn" aria-label={t('Cerrar')} onClick={() => setOpen(null)}>
                ✕
              </button>
            </div>
            <div className="style-preview">
              <StyleThumb p={shown} code={open} />
            </div>
            {shown?.error && <p className="err">{shown.error}</p>}
            <ul className="style-mix">
              {styleLabels(shown?.styles).map((s) => (
                <li key={s.label}>
                  {s.label} <span className="hint">{s.weight.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="btn primary" data-action="imagine" onClick={() => tryStyle(open)}>
                {t('Probar estilo')}
              </button>
              <button className="btn" onClick={() => copy(open)}>
                {t('Copiar --sref')}
              </button>
              <button className={`btn${liked.includes(open) ? ' primary' : ''}`} onClick={() => toggleStyleLike(open)}>
                <IconHeart size={15} filled={liked.includes(open)} /> {t('Me gusta')}
              </button>
              {shown?.status === 'error' && (
                <button className="btn" onClick={() => requestPreview(open, prompt)}>
                  {t('Reintentar')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Explore() {
  const jobs = useStore((s) => s.jobs);
  const urlQ = useQueryParam('q');
  const [view, setView] = useState<View>('recent');
  const [kind, setKind] = useState<Kind>('images');
  const [q, setQ] = useState(urlQ);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  useEffect(() => setQ(urlQ), [urlQ]);

  const items = useMemo(() => {
    const pool = myItems(jobs).filter((it) => (kind === 'videos') === (it.img.kind === 'video'));
    let list = view === 'random' ? shuffle(pool, seed) : view === 'likes' ? pool.filter((it) => it.img.liked) : pool;
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((g) => t.split(/\s+/).every((w) => g.prompt.toLowerCase().includes(w)));
    return list;
  }, [jobs, kind, view, seed, q]);

  return (
    <section aria-label={t('Explorar')}>
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label={t('Vista')}>
          {kind !== 'styles' &&
            (
              [
                ['recent', t('Recientes')],
                ['random', t('Aleatorio')],
                ['likes', t('Me gusta')],
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
        </div>
        <div className="row">
          <label className="search">
            <IconSearch size={16} />
            <input type="search" placeholder={kind === 'styles' ? t('Buscar estilos') : t('Buscar')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Buscar')} />
          </label>
          <div className="tabs" role="tablist" aria-label={t('Tipo')}>
            {(
              [
                ['images', t('Imágenes')],
                ['videos', t('Vídeos')],
                ['styles', t('Estilos')],
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
          <h2>{q ? t('Sin resultados') : view === 'likes' ? t('Aún no te gusta nada') : kind === 'videos' ? t('Aún no hay vídeos') : t('Aún no has creado nada')}</h2>
          <p>{q ? t('Prueba con otras palabras.') : view === 'likes' ? t('Pulsa el corazón en tus imágenes o vídeos para verlos aquí.') : t('Escribe una idea en la barra de arriba: todo lo que crees aparece aquí.')}</p>
        </div>
      ) : (
        <div className="masonry">
          {items.map((it, i) => (
            <Tile key={it.key} it={it} items={items} i={i} />
          ))}
        </div>
      )}
    </section>
  );
}
