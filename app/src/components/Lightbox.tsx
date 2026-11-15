import { useEffect, useState } from 'react';
import { closeLightbox, stepLightbox, useLightbox, type LbItem } from '../lightbox';
import { IconArrow, IconClose, IconDownload, IconEdit, IconFolder, IconHeart, IconMore, IconTrash, IconVideo } from '../icons';
import {
  addRef,
  addToFolder,
  createFolder,
  getState,
  imageToRef,
  openEditor,
  rerunJob,
  runAction,
  setDraft,
  setSettings,
  setTrashed,
  startPending,
  toast,
  toggleLike,
  useStore,
  type ActionOptions,
} from '../store';
import type { ActionKind, Job } from '../comfy/types';
import { navigate } from '../router';
import { Media } from './Media';

export function Lightbox() {
  const lb = useLightbox();
  const [tilePreview, setTilePreview] = useState(false);
  useEffect(() => {
    if (!lb) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lb]);
  useEffect(() => setTilePreview(false), [lb?.index]);
  if (!lb) return null;
  const item = lb.items[lb.index];
  const job = item.jobId ? getState().jobs.find((j) => j.id === item.jobId) : undefined;
  const tile = !!job?.inputs.tile;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Detalle de imagen">
      <div className="lb-stage" onClick={(e) => e.target === e.currentTarget && closeLightbox()}>
        {tilePreview ? (
          <div className="tile-preview" style={{ backgroundImage: `url("${item.img.url}")` }} onClick={() => setTilePreview(false)} title="Cerrar vista de patrón" />
        ) : (
          <div onClick={() => tile && setTilePreview(true)} style={{ cursor: tile ? 'zoom-in' : undefined }} title={tile ? 'Ver el patrón repetido' : undefined}>
            <Media img={item.img} alt={item.prompt} controls lazy={false} />
          </div>
        )}
        <button className="icon-btn lb-close" aria-label="Cerrar" onClick={closeLightbox}>
          <IconClose />
        </button>
        {lb.items.length > 1 && (
          <>
            <button className="icon-btn lb-nav prev" aria-label="Anterior" onClick={() => stepLightbox(-1)}>
              <IconArrow dir="left" />
            </button>
            <button className="icon-btn lb-nav next" aria-label="Siguiente" onClick={() => stepLightbox(1)}>
              <IconArrow dir="right" />
            </button>
          </>
        )}
      </div>
      <Panel key={`${lb.index}-${item.img.url.length}`} item={item} job={job} />
    </div>
  );
}

function go(jobs: unknown[]) {
  if (jobs.length) {
    closeLightbox();
    navigate('imagine');
  }
}

function MoreMenu({ item, job, onClose }: { item: LbItem; job?: Job; onClose: () => void }) {
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    toast(`${what} copiado`);
    onClose();
  };
  return (
    <div className="menu" role="menu">
      <button role="menuitem" onClick={() => copy(job?.rawPrompt ?? item.prompt, 'Prompt')}>
        Copiar prompt
      </button>
      {job && (
        <>
          <button role="menuitem" onClick={() => copy(String(job.inputs.seed), 'Semilla')}>
            Copiar semilla ({job.inputs.seed})
          </button>
          <button role="menuitem" onClick={() => copy(job.id, 'ID del trabajo')}>
            Copiar ID del trabajo
          </button>
        </>
      )}
      {!item.img.url.startsWith('data:') && (
        <button role="menuitem" onClick={() => copy(item.img.url, 'URL')}>
          Copiar URL de la imagen
        </button>
      )}
      {job && job.settings.resolution !== 'hd' && item.img.kind !== 'video' && (
        <button
          role="menuitem"
          onClick={() => {
            onClose();
            go(rerunJob(job, '--hd'));
          }}
        >
          Repetir en HD
        </button>
      )}
      <button
        role="menuitem"
        onClick={() => {
          onClose();
          closeLightbox();
          navigate('explore', { q: item.prompt.split(/[,.]/)[0].split(' ').slice(0, 3).join(' ') });
        }}
      >
        Buscar parecidas
      </button>
      {item.jobId && (
        <button
          role="menuitem"
          onClick={() => {
            setTrashed([{ jobId: item.jobId!, index: item.index ?? 0 }], true);
            toast('Movida a la papelera');
            onClose();
            closeLightbox();
          }}
        >
          Mover a la papelera
        </button>
      )}
    </div>
  );
}

function FolderMenu({ item, onClose }: { item: LbItem; onClose: () => void }) {
  const folders = useStore((s) => s.folders);
  const img = useStore((s) => s.jobs.find((j) => j.id === item.jobId)?.images[item.index ?? 0]);
  const [name, setName] = useState('');
  if (!item.jobId) return null;
  const sel = [{ jobId: item.jobId, index: item.index ?? 0 }];
  return (
    <div className="menu" role="menu">
      {folders.map((f) => {
        const inIt = !!img?.folderIds?.includes(f.id);
        return (
          <button key={f.id} role="menuitemcheckbox" aria-checked={inIt} onClick={() => addToFolder(sel, f.id, !inIt)}>
            {inIt ? '✓ ' : ''}
            {f.name}
          </button>
        );
      })}
      <form
        className="menu-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = createFolder(name);
          if (f) {
            addToFolder(sel, f.id);
            setName('');
            onClose();
          }
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva carpeta" aria-label="Nueva carpeta" />
      </form>
    </div>
  );
}

function Panel({ item, job }: { item: LbItem; job?: Job }) {
  const [menu, setMenu] = useState<'more' | 'folder' | null>(null);
  const isVideo = item.img.kind === 'video';
  const liked = useStore((s) => !!s.jobs.find((j) => j.id === item.jobId)?.images[item.index ?? 0]?.liked);
  const source = item.jobId !== undefined ? { jobId: item.jobId, index: item.index ?? 0 } : undefined;
  const opts = (): ActionOptions => (source ? { source } : { image: item.img, prompt: item.prompt });
  const act = (action: ActionKind, extra: Partial<ActionOptions> = {}) => go(runAction(action, { ...opts(), ...extra }));
  const rawPrompt = job?.rawPrompt ?? item.prompt;
  // Videos drop image-only parameters (as on the original site).
  const videoPrompt = job ? job.prompt : item.prompt.replace(/\s--\S.*$/, '');

  const download = () => {
    const a = document.createElement('a');
    a.href = item.img.url;
    const ext = item.img.url.startsWith('data:image/svg') ? 'svg' : item.img.url.startsWith('data:image/jpeg') ? 'jpg' : (item.img.ref?.filename.split('.').pop() ?? 'png');
    a.download = `lumen-${Date.now()}.${ext}`;
    a.target = '_blank';
    a.click();
  };

  const toBar = (fn: () => void, msg?: string) => {
    fn();
    closeLightbox();
    navigate('imagine');
    if (msg) toast(msg);
  };

  return (
    <aside className="lb-panel">
      <div>
        <div className="lb-top">
          <p className="lb-prompt">{rawPrompt}</p>
          <div className="lb-tools">
            <button className={`icon-btn${liked ? ' on' : ''}`} aria-label="Me gusta" aria-pressed={liked} onClick={() => item.jobId && toggleLike(item.jobId, item.index ?? 0)}>
              <IconHeart size={18} filled={liked} />
            </button>
            <button className="icon-btn" aria-label="Descargar" onClick={download}>
              <IconDownload size={18} />
            </button>
            <div className="menu-wrap">
              <button className="icon-btn" aria-label="Más opciones" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
                <IconMore size={18} />
              </button>
              {menu === 'more' && <MoreMenu item={item} job={job} onClose={() => setMenu(null)} />}
            </div>
          </div>
        </div>
        <div className="job-meta" style={{ marginTop: 8 }}>
          <span className="chip">
            {item.img.w}×{item.img.h}
          </span>
          {item.img.extended ? <span className="chip">alargado ×{item.img.extended}</span> : null}
          {item.meta?.map((m) => (
            <span className="chip" key={m}>
              {m}
            </span>
          ))}
        </div>
        {item.jobId && (
          <div className="menu-wrap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => setMenu(menu === 'folder' ? null : 'folder')} aria-expanded={menu === 'folder'}>
              <IconFolder size={15} /> Añadir a carpeta
            </button>
            {menu === 'folder' && <FolderMenu item={item} onClose={() => setMenu(null)} />}
          </div>
        )}
      </div>

      {isVideo ? (
        <>
          {job?.action !== 'upscale_video' && (
            <div className="action-group">
              <h3>Alargar vídeo</h3>
              <div className="action-row">
                <button className="btn" data-action="extend" onClick={() => act('extend', { motion: 'low', prompt: rawPrompt })}>
                  Auto · bajo
                </button>
                <button className="btn" data-action="extend" onClick={() => act('extend', { motion: 'high', prompt: rawPrompt })}>
                  Auto · alto
                </button>
                <button
                  className="btn"
                  data-action="extend"
                  onClick={() => toBar(() => startPending({ kind: 'extend', source, image: item.img, originalPrompt: rawPrompt }))}
                >
                  Manual…
                </button>
              </div>
              <p className="hint">Sigue el vídeo desde su último segundo y medio y lo une al final: unos 3,5 s más cada vez, hasta 4 veces.</p>
            </div>
          )}
          <div className="action-group">
            <h3>Vídeo</h3>
            <div className="action-row">
              {job && (
                <button className="btn" data-action={job.action} onClick={() => go(rerunJob(job))}>
                  Repetir
                </button>
              )}
              <button className="btn" data-action="video" onClick={() => go(runAction('video', { prompt: videoPrompt }))}>
                Nuevo vídeo con este prompt
              </button>
              {job?.action !== 'upscale_video' && (
                <button className="btn" data-action="upscale_video" onClick={() => act('upscale_video', { prompt: videoPrompt })}>
                  Ampliar ×2
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {job?.inputs.draft && (
            <div className="action-group">
              <h3>Borrador</h3>
              <div className="action-row">
                <button className="btn primary" data-action="vary_subtle" onClick={() => act('vary_subtle')}>
                  Mejorar (resolución completa)
                </button>
              </div>
              <p className="hint">Variar y Remezclar también regeneran el borrador a tamaño completo.</p>
            </div>
          )}
          <div className="action-group">
            <h3>Variar</h3>
            <div className="action-row">
              <button className="btn" data-action="vary_subtle" onClick={() => act('vary_subtle')}>
                Sutil
              </button>
              <button className="btn" data-action="vary_strong" onClick={() => act('vary_strong')}>
                Fuerte
              </button>
            </div>
          </div>

          <div className="action-group">
            <h3>Ampliar</h3>
            <div className="action-row">
              <button className="btn" data-action="upscale_subtle" onClick={() => act('upscale_subtle')}>
                Sutil
              </button>
              <button className="btn" data-action="upscale_creative" onClick={() => act('upscale_creative')}>
                Creativo
              </button>
            </div>
          </div>

          <div className="action-group">
            <h3>Remezclar</h3>
            <div className="action-row">
              {(['subtle', 'strong'] as const).map((st) => (
                <button
                  key={st}
                  className="btn"
                  data-action="remix"
                  onClick={() => toBar(() => startPending({ kind: 'remix', strength: st, source, image: item.img, originalPrompt: rawPrompt }), 'Edita el prompt en la barra y pulsa Enter')}
                >
                  {st === 'subtle' ? 'Sutil' : 'Fuerte'}
                </button>
              ))}
            </div>
          </div>

          <div className="action-group">
            <h3>Editar</h3>
            <div className="action-row">
              <button className="btn" data-action="edit" onClick={() => (openEditor({ image: item.img, prompt: rawPrompt, source }), closeLightbox(), navigate('edit'))}>
                <IconEdit size={15} /> Abrir editor
              </button>
              {(['left', 'up', 'down', 'right'] as const).map((d) => (
                <button key={d} className="btn" data-action="pan" aria-label={`Desplazar ${{ left: 'izquierda', up: 'arriba', down: 'abajo', right: 'derecha' }[d]}`} onClick={() => act('pan', { pan: d })}>
                  <IconArrow dir={d} size={16} />
                </button>
              ))}
              <button className="btn" data-action="zoom_out" onClick={() => act('zoom_out', { zoom: 1.5 })}>
                Alejar 1.5×
              </button>
              <button className="btn" data-action="zoom_out" onClick={() => act('zoom_out', { zoom: 2 })}>
                Alejar 2×
              </button>
            </div>
          </div>

          <div className="action-group">
            <h3>Animar</h3>
            <div className="action-row">
              <button className="btn" data-action="animate" onClick={() => act('animate', { motion: 'low', prompt: videoPrompt })}>
                <IconVideo size={16} /> Auto · bajo
              </button>
              <button className="btn" data-action="animate" onClick={() => act('animate', { motion: 'high', prompt: videoPrompt })}>
                <IconVideo size={16} /> Auto · alto
              </button>
              <button className="btn" data-action="animate" onClick={() => act('animate', { motion: 'low', prompt: videoPrompt, refs: { loop: true } })}>
                Bucle · bajo
              </button>
              <button className="btn" data-action="animate" onClick={() => act('animate', { motion: 'high', prompt: videoPrompt, refs: { loop: true } })}>
                Bucle · alto
              </button>
              <button
                className="btn"
                data-action="animate"
                onClick={() =>
                  toBar(() => {
                    addRef('start', imageToRef(item.img));
                    setSettings({ output: 'video' });
                    setDraft(videoPrompt);
                  }, 'Imagen puesta como fotograma inicial: describe el movimiento y pulsa Enter')
                }
              >
                Manual…
              </button>
            </div>
          </div>

          <div className="action-group">
            <h3>Usar</h3>
            <div className="action-row">
              <button className="btn" onClick={() => toBar(() => addRef('images', imageToRef(item.img)), 'Añadida como prompt de imagen')}>
                Imagen
              </button>
              <button className="btn" onClick={() => toBar(() => addRef('style', imageToRef(item.img)), 'Añadida como referencia de estilo')}>
                Estilo
              </button>
              <button className="btn" onClick={() => toBar(() => setDraft(rawPrompt))}>
                Prompt
              </button>
              <button className="btn" data-action="describe" onClick={() => act('describe')}>
                Describir
              </button>
            </div>
          </div>
        </>
      )}

      <div className="action-group">
        <h3>Más</h3>
        <div className="action-row">
          {job && job.action !== 'edit' && !isVideo && (
            <button className="btn" data-action={job.action} onClick={() => go(rerunJob(job))}>
              Repetir
            </button>
          )}
          {item.jobId && (
            <button
              className="btn"
              onClick={() => {
                setTrashed([{ jobId: item.jobId!, index: item.index ?? 0 }], true);
                toast('Movida a la papelera');
                closeLightbox();
              }}
            >
              <IconTrash size={15} /> Papelera
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
