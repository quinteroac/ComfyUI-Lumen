import { useMemo, useState } from 'react';
import { IconCheck, IconClose, IconDownload, IconFolder, IconHeart, IconSearch } from '../icons';
import { openLightbox, type LbItem } from '../lightbox';
import { addToFolder, emptyTrash, inFolder, setLiked, setTrashed, useStore } from '../store';
import type { Job } from '../comfy/types';
import { Media, VideoBadge } from '../components/Media';
import { FolderButton } from '../components/Folders';
import { imageHandlers } from '../components/ContextMenu';
import { jobMeta } from './Create';
import { save, saved as savedFile } from '../saved';
import { locale, t } from '../i18n';

type Filter = 'all' | 'liked' | 'images' | 'videos' | 'upscaled' | 'edited' | 'trash';
type Item = LbItem & { day: string; dayKey: string; key: string; job: Job };


/** Saved-search matching: every term must appear; "a, b" means either. */
function matches(job: Job, q: string) {
  const text = `${job.rawPrompt} ${jobMeta(job).join(' ')}`.toLowerCase();
  return q
    .toLowerCase()
    .split(',')
    .map((alt) => alt.trim())
    .filter(Boolean)
    .some((alt) => alt.split(/\s+/).every((t) => text.includes(t)));
}

export function Organize() {
  const jobs = useStore((s) => s.jobs);
  const folderId = useStore((s) => s.currentFolder);
  const folders = useStore((s) => s.folders);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState<string[]>(() => savedFile<string[]>('searches') ?? []);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<number | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const j of jobs) j.images.forEach((im) => !im.trashed && folders.forEach((f) => inFolder(j, im, f.id) && (c[f.id] = (c[f.id] ?? 0) + 1)));
    return c;
  }, [jobs, folders]);

  const { all, groups } = useMemo(() => {
    const items: Item[] = [];
    for (const job of jobs) {
      if (job.status !== 'done') continue;
      if (q.trim() && !matches(job, q)) continue;
      const d = new Date(job.createdAt);
      const day = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
      const dayKey = d.toISOString().slice(0, 10);
      job.images.forEach((img, index) => {
        if (filter === 'trash' ? !img.trashed : img.trashed) return;
        if (filter === 'liked' && !img.liked) return;
        if (filter === 'images' && img.kind === 'video') return;
        if (filter === 'videos' && img.kind !== 'video') return;
        if (filter === 'upscaled' && !job.action.startsWith('upscale')) return;
        if (filter === 'edited' && !['edit', 'retexture', 'pan', 'zoom_out', 'remix'].includes(job.action)) return;
        if (folderId && !inFolder(job, img, folderId)) return;
        items.push({ img, prompt: job.prompt, jobId: job.id, index, day, dayKey, key: `${job.id}:${index}`, job, meta: jobMeta(job) });
      });
    }
    const out: { day: string; dayKey: string; start: number; items: Item[] }[] = [];
    items.forEach((it, i) => {
      const last = out[out.length - 1];
      if (last && last.dayKey === it.dayKey) last.items.push(it);
      else out.push({ day: it.day, dayKey: it.dayKey, start: i, items: [it] });
    });
    return { all: items, groups: out };
  }, [jobs, filter, q, folderId]);

  const selected = all.filter((it) => sel.has(it.key));
  const selRefs = selected.map((it) => ({ jobId: it.jobId!, index: it.index! }));
  const toggle = (it: Item, i: number, shift: boolean) => {
    const next = new Set(sel);
    if (shift && lastClicked !== null) {
      const [a, b] = [Math.min(lastClicked, i), Math.max(lastClicked, i)];
      for (let k = a; k <= b; k++) next.add(all[k].key);
    } else if (next.has(it.key)) next.delete(it.key);
    else next.add(it.key);
    setSel(next);
    setLastClicked(i);
  };
  const clear = () => setSel(new Set());
  const saveSearch = () => {
    const search = q.trim();
    if (!search || saved.includes(search)) return;
    const next = [...saved, search];
    setSaved(next);
    save('searches', next);
  };
  const removeSaved = (search: string) => {
    const next = saved.filter((x) => x !== search);
    setSaved(next);
    save('searches', next);
  };
  const download = () =>
    selected.forEach((it, n) =>
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = it.img.url;
        a.download = `lumen-${it.jobId}-${it.index}`;
        a.target = '_blank';
        a.click();
      }, n * 250),
    );

  return (
    <section aria-label={t('Organizar')} className="organize">
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label={t('Filtro')}>
          {(
            [
              ['all', t('Todas')],
              ['liked', t('Me gusta')],
              ['images', t('Imágenes')],
              ['videos', t('Vídeos')],
              ['upscaled', t('Ampliadas')],
              ['edited', t('Editadas')],
              ['trash', t('Papelera')],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              className={`tab${filter === k ? ' on' : ''}`}
              onClick={() => {
                setFilter(k);
                clear();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <FolderButton counts={counts} />
          <label className="search">
            <IconSearch size={16} />
            <input type="search" placeholder={t('Buscar: palabras, --ar 16:9, HD…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Buscar en tus imágenes')} />
          </label>
          {q.trim() && !saved.includes(q.trim()) && (
            <button className="btn small" onClick={saveSearch} title={t('Guardar esta búsqueda')}>
              {t('Guardar búsqueda')}
            </button>
          )}
        </div>
      </div>
      {saved.length > 0 && (
        <div className="saved-searches">
          {saved.map((search) => (
            <span key={search} className={`chip strong${q.trim() === search ? ' on' : ''}`}>
              <button className="link-plain" onClick={() => setQ(search)}>
                {search}
              </button>
              <button className="chip-x" aria-label={t('Borrar búsqueda {search}', { search })} onClick={() => removeSaved(search)}>
                <IconClose size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {filter === 'trash' && all.length > 0 && (
        <div className="banner">
          <span>{t('Las imágenes en la papelera no aparecen en Crear. Puedes restaurarlas o vaciarla.')}</span>
          <button className="btn small" onClick={() => confirm(t('¿Vaciar la papelera? Se borran de este navegador.')) && emptyTrash()}>
            {t('Vaciar papelera')}
          </button>
        </div>
      )}
      {all.length === 0 ? (
        <div className="empty">
          <h2>{jobs.length ? t('Nada por aquí') : t('Tu archivo está vacío')}</h2>
          <p>{jobs.length ? t('Cambia el filtro, la carpeta o la búsqueda.') : t('Las imágenes y vídeos que crees aparecerán aquí, ordenados por día.')}</p>
        </div>
      ) : (
        <div className="organize-body">
          <div>
            {groups.map((g) => (
              <div key={g.dayKey} id={`day-${g.dayKey}`}>
                <div className="day-row">
                  <h2 className="day">{g.day}</h2>
                  <button
                    className="link-btn"
                    onClick={() => {
                      const next = new Set(sel);
                      g.items.forEach((it) => next.add(it.key));
                      setSel(next);
                    }}
                  >
                    {t('Seleccionar el día')}
                  </button>
                </div>
                <div className="grid">
                  {g.items.map((it, k) => {
                    const i = g.start + k;
                    const isSel = sel.has(it.key);
                    return (
                      <div
                        key={it.key}
                        className={`job-img${isSel ? ' selected' : ''}`}
                        {...imageHandlers(() => (isSel ? selRefs : [{ jobId: it.jobId!, index: it.index! }]))}
                      >
                        <button
                          className="tile-open"
                          onClick={(e) => (sel.size || e.shiftKey ? toggle(it, i, e.shiftKey) : openLightbox(all, i))}
                          aria-label={it.prompt}
                        >
                          <Media img={it.img} alt={it.prompt} />
                        </button>
                        {it.img.kind === 'video' && <VideoBadge />}
                        <button className={`select-box${isSel ? ' on' : ''}`} aria-label={isSel ? t('Quitar de la selección') : t('Seleccionar')} aria-pressed={isSel} onClick={(e) => toggle(it, i, e.shiftKey)}>
                          {isSel && <IconCheck size={14} />}
                        </button>
                        {it.img.liked && (
                          <span className="liked-mark">
                            <IconHeart size={14} filled />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {groups.length > 1 && (
            <nav className="timeline" aria-label={t('Línea de tiempo')}>
              {groups.map((g) => (
                <a key={g.dayKey} href={`#day-${g.dayKey}`} title={g.day}>
                  {g.dayKey.slice(5).replace('-', '/')}
                </a>
              ))}
            </nav>
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label={t('Acciones con la selección')}>
          <strong>{t('{selected} seleccionadas', { selected: selected.length })}</strong>
          <button className="btn small" onClick={() => setLiked(selRefs, true)}>
            <IconHeart size={14} /> {t('Me gusta')}
          </button>
          <button className="btn small" onClick={() => setLiked(selRefs, false)}>
            {t('Quitar me gusta')}
          </button>
          {filter === 'trash' ? (
            <button
              className="btn small"
              onClick={() => {
                setTrashed(selRefs, false);
                clear();
              }}
            >
              {t('Restaurar')}
            </button>
          ) : (
            <button
              className="btn small"
              onClick={() => {
                setTrashed(selRefs, true);
                clear();
              }}
            >
              {t('Papelera')}
            </button>
          )}
          {folders.length > 0 && (
            <select
              className="select-small"
              value=""
              aria-label={t('Añadir a carpeta')}
              onChange={(e) => {
                if (e.target.value) addToFolder(selRefs, e.target.value);
              }}
            >
              <option value="">{t('Añadir a carpeta…')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          {folderId && (
            <button className="btn small" onClick={() => addToFolder(selRefs, folderId, false)}>
              <IconFolder size={14} /> {t('Quitar de la carpeta')}
            </button>
          )}
          <button className="btn small" onClick={download}>
            <IconDownload size={14} /> {t('Descargar')}
          </button>
          <button className="btn small" onClick={clear}>
            {t('Cancelar')}
          </button>
        </div>
      )}
    </section>
  );
}
