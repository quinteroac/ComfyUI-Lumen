import { useMemo, useState } from 'react';
import { IconCopy, IconEdit, IconPlus, IconTrash } from '../icons';
import {
  UNLOCK_PICKS,
  createProfile,
  deleteProfile,
  getState,
  isUnlocked,
  profileCode,
  profileSref,
  profileTopCodes,
  recordProfilePicks,
  renameProfile,
  setDraft,
  toast,
  toggleProfileDefault,
  togglePersonalization,
  useStore,
} from '../store';
import type { Profile } from '../comfy/types';
import { navigate } from '../router';
import { Media } from '../components/Media';
import { useConfig } from '../useConfig';
import { previewKey, randomCode, requestPreview, styleTitle, usePreviews, type StylePreview } from '../stylePreviews';

const BATCH = 8;

function Preview({ p }: { p?: StylePreview }) {
  if (p?.status === 'done' && p.image) return <Media img={p.image} alt="" />;
  return <span className="placeholder style-pending">{p?.status === 'error' ? 'Error' : p?.status === 'running' ? 'Generando…' : 'En cola'}</span>;
}

/** Real style samples (random --sref codes on the preview prompt, shared with Explore): pick the ones you like. */
function Rater({ p, onClose }: { p: Profile; onClose: () => void }) {
  const previews = usePreviews();
  const prompt = useConfig().styleCodes.previewPrompt;
  const newBatch = () => {
    const codes = Array.from({ length: BATCH }, randomCode).filter((c) => !(c in p.scores));
    codes.forEach((c) => requestPreview(c, prompt));
    return codes;
  };
  const [batch, setBatch] = useState(newBatch);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const preview = (code: string) => previews[previewKey(code, prompt)];
  const ready = batch.every((c) => preview(c)?.status === 'done' || preview(c)?.status === 'error');
  const total = p.picks + picked.size;
  const pct = Math.min(100, Math.round((total / UNLOCK_PICKS) * 100));
  const commit = () => {
    const shown = batch.filter((c) => preview(c)?.status === 'done');
    recordProfilePicks(p.id, shown.filter((c) => picked.has(c)), shown.filter((c) => !picked.has(c)));
    if (p.picks < UNLOCK_PICKS && p.picks + picked.size >= UNLOCK_PICKS) toast(`¡«${p.name}» desbloqueado! Ya puedes usarlo con --p.`);
    setPicked(new Set());
    setBatch(newBatch());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="rater">
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <p className="hint">Elige los estilos que más te gusten (no por su contenido). Aprende de lo que eliges y de lo que no.</p>
        </div>
        <button className="btn small" onClick={onClose}>
          Terminar
        </button>
      </div>
      <div className="progress big" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progreso de desbloqueo">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="hint">{isUnlocked(p) ? `Desbloqueado · ${total} elegidos: cuantos más elijas, mejor te conoce.` : `${total} / ${UNLOCK_PICKS} para desbloquear`}</p>
      <div className="samples" style={{ marginTop: 12 }}>
        {batch.map((code) => {
          const pv = preview(code);
          return (
            <div key={code} className={`sample${picked.has(code) ? ' picked' : ''}`}>
              <button
                className="sample-img"
                aria-pressed={picked.has(code)}
                aria-label={`Me gusta: ${styleTitle(pv?.styles) || code}`}
                title={styleTitle(pv?.styles)}
                disabled={pv?.status !== 'done'}
                onClick={() => {
                  const n = new Set(picked);
                  if (n.has(code)) n.delete(code);
                  else n.add(code);
                  setPicked(n);
                }}
              >
                <Preview p={pv} />
                {picked.has(code) && <span className="picked-mark">✓</span>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="sentinel">
        <button className="btn primary" onClick={commit} disabled={!ready}>
          {!ready ? 'Generando muestras…' : picked.size ? `Guardar ${picked.size} y ver más` : 'Ninguna me gusta: ver más'}
        </button>
      </div>
    </div>
  );
}

function ProfileCard({ p, onRate }: { p: Profile; onRate: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const unlocked = isUnlocked(p);
  const previews = usePreviews();
  const prompt = useConfig().styleCodes.previewPrompt;
  // The profile's best codes, shown with their previews.
  const top = useMemo(() => profileTopCodes(p).map(([code]) => code), [p]);
  const sref = profileSref(p);
  const use = () => {
    const d = getState().draft.replace(/\s--p\b[^-]*/g, ' ').trim();
    setDraft(`${d} --p ${p.id}`.trim());
    navigate('imagine');
    toast(`--p ${p.id} añadido a la barra`);
  };
  return (
    <section className="card profile" aria-label={p.name}>
      <button className="profile-thumbs" onClick={onRate} title="Elegir imágenes para este perfil">
        {top.slice(0, 3).map((code) => (
          <Preview key={code} p={previews[previewKey(code, prompt)]} />
        ))}
        {!unlocked && <span className="lock">🔒 {p.picks}/{UNLOCK_PICKS}</span>}
      </button>
      <div className="profile-body">
        <div className="board-head">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                renameProfile(p.id, (e.currentTarget.elements.namedItem('n') as HTMLInputElement).value);
                setRenaming(false);
              }}
            >
              <input name="n" className="board-name-input" defaultValue={p.name} autoFocus onBlur={() => setRenaming(false)} aria-label="Nombre del perfil" />
            </form>
          ) : (
            <h2>{p.name}</h2>
          )}
          <div className="row">
            <button className="icon-btn" aria-label="Renombrar" title="Renombrar" onClick={() => setRenaming(true)}>
              <IconEdit size={16} />
            </button>
            {p.id !== 'global' && (
              <button className="icon-btn" aria-label="Borrar perfil" title="Borrar (los códigos ya usados siguen funcionando)" onClick={() => confirm(`¿Borrar «${p.name}»?`) && deleteProfile(p.id)}>
                <IconTrash size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="progress" aria-label="Progreso">
          <div style={{ width: `${Math.min(100, (p.picks / UNLOCK_PICKS) * 100)}%` }} />
        </div>
        <p className="hint">
          {unlocked ? (
            <>
              ID <code>{p.id}</code> · versión <code>--p {profileCode(p)}</code> · {p.picks} elegidos
              {sref ? <> · mezcla <code>--sref {sref}</code></> : null}
            </>
          ) : (
            `Bloqueado: elige ${UNLOCK_PICKS - p.picks} imágenes más para desbloquearlo.`
          )}
        </p>
        <div className="row">
          <button className="btn small primary" onClick={onRate}>
            {unlocked ? 'Seguir eligiendo' : 'Desbloquear'}
          </button>
          <button className="btn small" onClick={use} disabled={!unlocked}>
            <IconCopy size={14} /> Usar
          </button>
          <label className="switch small" title="Usar por defecto cuando la personalización está activada">
            <input type="checkbox" checked={p.isDefault} onChange={() => toggleProfileDefault(p.id)} /> Predeterminado
          </label>
        </div>
      </div>
    </section>
  );
}

export function Personalize() {
  const profiles = useStore((s) => s.profiles);
  const on = useStore((s) => s.personalization);
  const [rating, setRating] = useState<string | null>(null);
  const [name, setName] = useState('');
  const current = profiles.find((p) => p.id === rating);
  if (current) return <div className="page">{<Rater p={current} onClose={() => setRating(null)} />}</div>;
  const global = profiles.find((p) => p.id === 'global');
  return (
    <div className="page">
      <h1>Personalizar</h1>
      <p className="lead">
        Enseña tus gustos eligiendo entre muestras de estilos reales (códigos <code>--sref</code> generados con el prompt de vista previa). Tu perfil global se desbloquea tras {UNLOCK_PICKS} elecciones; los «me gusta» en Explorar › Estilos también lo afinan. Un perfil es la mezcla de sus 4 mejores códigos: úsalo con <code>--p</code> o activa la personalización junto a la barra; <code>--sw</code> controla cuánto se aplica.
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const p = createProfile(name);
            if (p) {
              setName('');
              setRating(p.id);
            }
          }}
        >
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del perfil" aria-label="Nombre del nuevo perfil" disabled={!isUnlocked(global)} />
          <button className="btn" type="submit" disabled={!isUnlocked(global)} title={isUnlocked(global) ? '' : 'Primero desbloquea tu perfil global'}>
            <IconPlus size={15} /> Nuevo perfil
          </button>
        </form>
        <button className={`btn${on ? ' primary' : ''}`} onClick={togglePersonalization}>
          Personalización {on ? 'activada' : 'desactivada'}
        </button>
        <button className="btn" onClick={() => navigate('moodboards')}>
          Moodboards
        </button>
      </div>
      {profiles.map((p) => (
        <ProfileCard key={p.id} p={p} onRate={() => setRating(p.id)} />
      ))}
      <p className="hint">
        Con los workflows integrados, un perfil añade su mezcla al --sref del trabajo (nodos Style Code de H3, MOSS y Anima); con tu propio workflow también recibes su código como {'{{moodboard}}'}.
      </p>
    </div>
  );
}
