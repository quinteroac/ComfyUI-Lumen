import { useEffect, useSyncExternalStore } from 'react';
import { addToFolder, getState, inFolder, runAction, setTrashed, toast, toggleLike, openEditor, useStore } from '../store';
import { navigate } from '../router';
import { DRAG_TYPE } from './Folders';
import { t } from '../i18n';

/** Right-click menu for one of your images: add to / remove from folders, like, describe, edit, trash. */
interface Ctx {
  x: number;
  y: number;
  items: { jobId: string; index: number }[];
}

let ctx: Ctx | null = null;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
export const openContextMenu = (c: Ctx) => {
  ctx = c;
  emit();
};
const close = () => {
  ctx = null;
  emit();
};

/** Props to make an image tile draggable onto folders and right-clickable. */
export function imageHandlers(items: () => { jobId: string; index: number }[]) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(items()));
      e.dataTransfer.effectAllowed = 'copy';
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      openContextMenu({ x: e.clientX, y: e.clientY, items: items() });
    },
  };
}

export function ContextMenu() {
  const c = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => ctx,
  );
  const folders = useStore((s) => s.folders);
  useEffect(() => {
    if (!c) return;
    const off = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.('.ctx-menu')) close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', esc);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', close, true);
    };
  }, [c]);
  if (!c) return null;
  const jobs = getState().jobs;
  const pairs = c.items.map((it) => ({ it, job: jobs.find((j) => j.id === it.jobId)! })).filter((p) => p.job);
  const one = pairs.length === 1 ? pairs[0] : undefined;
  const img = one ? one.job.images[one.it.index] : undefined;
  const inAll = (fid: string) => pairs.every(({ it, job }) => inFolder(job, job.images[it.index], fid));
  const inSome = (fid: string) => pairs.some(({ it, job }) => job.images[it.index]?.folderIds?.includes(fid));
  const left = Math.min(c.x, window.innerWidth - 240);
  const top = Math.min(c.y, window.innerHeight - 320);
  return (
    <div className="menu ctx-menu" role="menu" style={{ position: 'fixed', left, top }}>
      <span className="menu-label">{pairs.length > 1 ? t('{pairs} imágenes', { pairs: pairs.length }) : t('Imagen')}</span>
      {folders.length > 0 && <span className="menu-label">{t('Añadir a…')}</span>}
      {folders
        .filter((f) => !inAll(f.id))
        .map((f) => (
          <button
            key={f.id}
            role="menuitem"
            onClick={() => {
              addToFolder(c.items, f.id);
              toast(t('Añadida a «{name}»', { name: f.name }));
              close();
            }}
          >
            + {f.name}
          </button>
        ))}
      {folders.some((f) => inSome(f.id)) && <span className="menu-label">{t('Quitar de…')}</span>}
      {folders
        .filter((f) => inSome(f.id))
        .map((f) => (
          <button
            key={f.id}
            role="menuitem"
            onClick={() => {
              addToFolder(c.items, f.id, false);
              close();
            }}
          >
            − {f.name}
          </button>
        ))}
      {one && img && (
        <>
          <button role="menuitem" onClick={() => (toggleLike(one.it.jobId, one.it.index), close())}>
            {img.liked ? t('Quitar me gusta') : t('Me gusta')}
          </button>
          {img.kind !== 'video' && (
            <>
              <button role="menuitem" onClick={() => (runAction('describe', { source: one.it }), close(), navigate('imagine'))}>
                {t('Describir imagen')}
              </button>
              <button role="menuitem" onClick={() => (openEditor({ image: img, prompt: one.job.rawPrompt, source: one.it }), close(), navigate('edit'))}>
                {t('Abrir en el editor')}
              </button>
            </>
          )}
        </>
      )}
      <button
        role="menuitem"
        className="danger"
        onClick={() => {
          setTrashed(c.items, true);
          close();
        }}
      >
        {t('Mover a la papelera')}
      </button>
    </div>
  );
}
