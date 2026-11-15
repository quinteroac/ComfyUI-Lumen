import { useMemo, useState } from 'react';
import { artUrl, hash } from '../demo';
import { IconCopy, IconEdit, IconPlus, IconTrash } from '../icons';
import {
  UNLOCK_PICKS,
  createProfile,
  deleteProfile,
  getState,
  isUnlocked,
  profileCode,
  profileWords,
  recordProfilePicks,
  renameProfile,
  setDraft,
  toast,
  toggleProfileDefault,
  togglePersonalization,
  useStore,
} from '../store';
import { makeSample, type Sample } from '../styles';
import type { Profile } from '../comfy/types';
import { navigate } from '../router';

const BATCH = 12;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sampleUrl(s: Sample) {
  return artUrl({ key: hash(s.words), layers: [{ seed: hash(s.id), jitter: 1 }], w: 512, h: 512 });
}

/** Grid of images: pick the ones you like; each batch teaches the profile. */
function Rater({ p, onClose }: { p: Profile; onClose: () => void }) {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [seed] = useState(() => Date.now() % 1000000);
  const batch = useMemo(() => {
    const r = rng(seed + round * 7919);
    return Array.from({ length: BATCH }, (_, i) => makeSample(p.scores, r, round * BATCH + i));
    // A new batch only when the round changes (scores update after each batch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, seed]);
  const total = p.picks + picked.size;
  const pct = Math.min(100, Math.round((total / UNLOCK_PICKS) * 100));
  const commit = () => {
    const chosen = batch.filter((s) => picked.has(s.id));
    recordProfilePicks(
      p.id,
      chosen,
      batch.filter((s) => !picked.has(s.id)),
    );
    if (p.picks < UNLOCK_PICKS && p.picks + chosen.length >= UNLOCK_PICKS) toast(`¡«${p.name}» desbloqueado! Ya puedes usarlo con --p.`);
    setPicked(new Set());
    setRound((r) => r + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="rater">
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <p className="hint">Elige las imágenes que más te gusten. Aprende de lo que eliges y de lo que no.</p>
        </div>
        <button className="btn small" onClick={onClose}>
          Terminar
        </button>
      </div>
      <div className="progress big" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progreso de desbloqueo">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="hint">{isUnlocked(p) ? `Desbloqueado · ${total} imágenes elegidas: cuantas más elijas, mejor te conoce.` : `${total} / ${UNLOCK_PICKS} para desbloquear`}</p>
      <div className="samples" style={{ marginTop: 12 }}>
        {batch.map((s) => (
          <div key={s.id} className={`sample${picked.has(s.id) ? ' picked' : ''}`}>
            <button
              className="sample-img"
              aria-pressed={picked.has(s.id)}
              aria-label={`Me gusta: ${s.words}`}
              onClick={() => {
                const n = new Set(picked);
                if (n.has(s.id)) n.delete(s.id);
                else n.add(s.id);
                setPicked(n);
              }}
            >
              <img src={sampleUrl(s)} alt="" loading="lazy" />
              {picked.has(s.id) && <span className="picked-mark">✓</span>}
            </button>
          </div>
        ))}
      </div>
      <div className="sentinel">
        <button className="btn primary" onClick={commit}>
          {picked.size ? `Guardar ${picked.size} y ver más` : 'Ninguna me gusta: ver más'}
        </button>
      </div>
    </div>
  );
}

function ProfileCard({ p, onRate }: { p: Profile; onRate: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const unlocked = isUnlocked(p);
  const words = profileWords(p);
  const thumbs = useMemo(() => [0, 1, 2].map((n) => artUrl({ key: hash(words || p.id), layers: [{ seed: n * 131 + 5, jitter: 1 }], w: 300, h: 300 })), [words, p.id]);
  const use = () => {
    const d = getState().draft.replace(/\s--p\b[^-]*/g, ' ').trim();
    setDraft(`${d} --p ${p.id}`.trim());
    navigate('imagine');
    toast(`--p ${p.id} añadido a la barra`);
  };
  return (
    <section className="card profile" aria-label={p.name}>
      <button className="profile-thumbs" onClick={onRate} title="Elegir imágenes para este perfil">
        {thumbs.map((t, n) => (
          <img key={n} src={t} alt="" />
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
              ID <code>{p.id}</code> · versión <code>--p {profileCode(p)}</code> · {p.picks} elegidas
              {words ? <> · {words}</> : null}
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
        Enseña tus gustos eligiendo imágenes. Tu perfil global se desbloquea tras {UNLOCK_PICKS} elecciones; los «me gusta» en Explorar también lo afinan. Úsalo con <code>--p</code> o activa la personalización junto a la barra. La estilización (<code>--s</code>) controla cuánto se aplica.
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
        Con el workflow integrado, un perfil añade al prompt las palabras de estilo que ha aprendido; con tu propio workflow también recibes su código como {'{{moodboard}}'}.
      </p>
    </div>
  );
}
