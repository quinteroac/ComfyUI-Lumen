import { useRef, useState } from 'react';
import { IconClose, IconCopy, IconEdit, IconPlus, IconTrash, IconUpload } from '../icons';
import {
  addBoardImages,
  createMoodboard,
  deleteMoodboard,
  getState,
  moodboardCode,
  removeBoardImage,
  renameMoodboard,
  setDraft,
  setMoodboardWords,
  toast,
  toggleMoodboardDefault,
  togglePersonalization,
  useStore,
} from '../store';
import { thumbDataUrl } from '../images';
import type { BoardImage, Moodboard } from '../comfy/types';
import { navigate } from '../router';
import { t } from '../i18n';

type NewImage = Omit<BoardImage, 'id'>;

async function fromFile(f: File): Promise<NewImage> {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.src = url;
  await img.decode();
  const t = await thumbDataUrl(url, img.naturalWidth, img.naturalHeight);
  URL.revokeObjectURL(url);
  return t;
}

async function fromUrl(url: string): Promise<NewImage> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  try {
    return await thumbDataUrl(url, img.naturalWidth, img.naturalHeight);
  } catch {
    // The site doesn't allow copying: keep the link instead.
    return { url, w: img.naturalWidth, h: img.naturalHeight };
  }
}

/** Pick images from your own creations. */
function GalleryPicker({ onPick, onClose }: { onPick: (imgs: NewImage[]) => void; onClose: () => void }) {
  const jobs = useStore((s) => s.jobs);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const items = jobs
    .filter((j) => j.status === 'done')
    .flatMap((j) => j.images.map((img, i) => ({ key: `${j.id}:${i}`, img, prompt: j.prompt })))
    .filter(({ img }) => img.kind !== 'video' && !img.trashed)
    .slice(0, 60);
  return (
    <div className="lightbox style-modal" role="dialog" aria-modal="true" aria-label={t('Elegir de tus imágenes')} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="style-detail">
        <div className="lb-top">
          <h2>{t('Elegir de tus imágenes')}</h2>
          <button className="icon-btn" aria-label={t('Cerrar')} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="hint">{t('Aún no has creado imágenes.')}</p>
        ) : (
          <div className="grid">
            {items.map(({ key, img, prompt }) => (
              <button
                key={key}
                className={`job-img${sel.has(key) ? ' selected' : ''}`}
                aria-pressed={sel.has(key)}
                onClick={() => {
                  const n = new Set(sel);
                  if (n.has(key)) n.delete(key);
                  else n.add(key);
                  setSel(n);
                }}
              >
                <img src={img.url} alt={prompt} />
              </button>
            ))}
          </div>
        )}
        <div className="row">
          <button
            className="btn primary"
            disabled={!sel.size}
            onClick={async () => {
              const picked = items.filter((it) => sel.has(it.key));
              const out: NewImage[] = [];
              for (const { img } of picked) {
                // Keep a small copy plus the ComfyUI reference (so workflows get the full image).
                let small = { url: img.url, w: img.w, h: img.h };
                try {
                  small = await thumbDataUrl(img.url, img.w, img.h);
                } catch {
                  /* cross-origin: keep the link */
                }
                out.push({ ...small, ref: img.ref });
              }
              onPick(out);
              onClose();
            }}
          >
            {t('Añadir')} {sel.size || ''}
          </button>
          <button className="btn" onClick={onClose}>
            {t('Cancelar')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Board({ m }: { m: Moodboard }) {
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const add = async (p: Promise<NewImage[]>) => {
    setBusy(true);
    try {
      const imgs = await p;
      addBoardImages(m.id, imgs);
    } catch {
      toast(t('No se pudo añadir la imagen.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const use = () => {
    const d = getState().draft.replace(/\s--p\b[^-]*/g, ' ').trim();
    setDraft(`${d} --p ${m.id}`.trim());
    navigate('imagine');
    toast(t('--p {id} añadido a la barra', { id: m.id }));
  };
  return (
    <section className="card board" aria-label={m.name}>
      <div className="board-head">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              renameMoodboard(m.id, (e.currentTarget.elements.namedItem('n') as HTMLInputElement).value);
              setRenaming(false);
            }}
          >
            <input name="n" className="board-name-input" defaultValue={m.name} autoFocus onBlur={() => setRenaming(false)} aria-label={t('Nombre del moodboard')} />
          </form>
        ) : (
          <h2>{m.name}</h2>
        )}
        <div className="row">
          <label className="switch" title={t('Usar por defecto cuando la personalización está activada')}>
            <input type="checkbox" checked={m.isDefault} onChange={() => toggleMoodboardDefault(m.id)} /> {t('Predeterminado')}
          </label>
          <button className="btn small" onClick={use} title={t('Añadir --p a la barra de imaginar')} disabled={!m.images.length}>
            <IconCopy size={14} /> {t('Usar')}
          </button>
          <button className="icon-btn" aria-label={t('Renombrar')} title={t('Renombrar')} onClick={() => setRenaming(true)}>
            <IconEdit size={16} />
          </button>
          <button
            className="icon-btn"
            aria-label={t('Borrar moodboard')}
            title={t('Borrar (los códigos ya usados siguen funcionando)')}
            onClick={() => confirm(t('¿Borrar «{name}»? Los códigos que ya usaste seguirán funcionando.', { name: m.name })) && deleteMoodboard(m.id)}
          >
            <IconTrash size={16} />
          </button>
        </div>
      </div>
      <p className="hint">
        {t('ID')} <code>{m.id}</code> {t('· versión actual')} <code>--p {moodboardCode(m)}</code> {t('· {length} imágenes', { length: m.images.length })}
      </p>
      <div
        className="board-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
          if (files.length) add(Promise.all(files.map(fromFile)));
          else {
            const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (u) add(fromUrl(u.trim()).then((x) => [x]));
          }
        }}
      >
        {m.images.map((im) => (
          <div key={im.id} className="board-img">
            <img src={im.url} alt="" />
            <button className="icon-btn tiny" aria-label={t('Quitar del moodboard')} onClick={() => removeBoardImage(m.id, im.id)}>
              <IconClose size={12} />
            </button>
          </div>
        ))}
        <button className="board-add" onClick={() => file.current?.click()} disabled={busy}>
          <IconUpload size={18} />
          <span>{busy ? t('Añadiendo…') : t('Subir')}</span>
        </button>
        <button className="board-add" onClick={() => setPicking(true)}>
          <IconPlus size={18} />
          <span>{t('De tus imágenes')}</span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = '';
            if (fs.length) add(Promise.all(fs.map(fromFile)));
          }}
        />
      </div>
      <form
        className="row"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) add(fromUrl(url.trim()).then((x) => [x]));
          setUrl('');
        }}
      >
        <input className="text-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('Pegar la URL de una imagen')} aria-label={t('URL de una imagen')} />
        <button className="btn small" type="submit" disabled={!url.trim()}>
          {t('Añadir URL')}
        </button>
      </form>
      <label className="field wide" style={{ marginTop: 8 }}>
        {t('Palabras del estilo (opcional)')}
        <input value={m.words} onChange={(e) => setMoodboardWords(m.id, e.target.value)} placeholder={t('p. ej. tonos terrosos, luz suave, textura de papel')} />
      </label>
      {picking && <GalleryPicker onPick={(imgs) => addBoardImages(m.id, imgs)} onClose={() => setPicking(false)} />}
    </section>
  );
}

export function Moodboards() {
  const boards = useStore((s) => s.moodboards);
  const on = useStore((s) => s.personalization);
  const [name, setName] = useState('');
  return (
    <div className="page">
      <h1>{t('Moodboards')}</h1>
      <p className="lead">
        {t('Reúne imágenes para crear un estilo propio. Úsalo con')} <code>{t('--p ID')}</code> {t('en el prompt, o márcalo como predeterminado y activa la personalización junto a la barra para que se añada a todos tus prompts. La estilización (')}<code>--sw</code>{t(') controla cuánto se aplica.')}
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            createMoodboard(name);
            setName('');
          }}
        >
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Nombre del moodboard')} aria-label={t('Nombre del nuevo moodboard')} />
          <button className="btn primary" type="submit">
            <IconPlus size={15} /> {t('Nuevo moodboard')}
          </button>
        </form>
        <button className={`btn${on ? ' primary' : ''}`} onClick={togglePersonalization}>
          {t('Personalización')} {on ? 'activada' : 'desactivada'}
        </button>
      </div>
      {boards.length === 0 ? (
        <div className="empty">
          <h2>{t('Aún no tienes moodboards')}</h2>
          <p>{t('Crea uno y añade imágenes subiéndolas, pegando una URL o eligiendo de tus creaciones.')}</p>
        </div>
      ) : (
        boards.map((m) => <Board key={m.id} m={m} />)
      )}
      <p className="hint">
        {t('Con tu ComfyUI, las imágenes del moodboard llegan a tus workflows como referencia de estilo (')}{'{{style_image}}'}{t(') y su código como')} {'{{moodboard}}'}{t('; el workflow integrado solo usa las palabras del estilo.')}
      </p>
    </div>
  );
}
