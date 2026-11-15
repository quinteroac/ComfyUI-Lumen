import { useEffect, useMemo, useRef, useState } from 'react';
import { artUrl, hash } from '../demo';
import { IconHeart, IconClose } from '../icons';
import { getState, runAction, setDraft, toast, toggleStyleLike, useStore } from '../store';
import { navigate } from '../router';
import { ATOMS, ATOM_GROUPS, learnedWords, makeSample, registerStyle, type Sample } from '../styles';
import { Media } from '../components/Media';

/* Open the Style Creator with a prompt (from the Create page). */
let incoming = '';
export function openStyleCreator(prompt: string) {
  incoming = prompt;
  navigate('style-creator');
}

const BATCH = 12;
const PICKS_PER_ROUND = 4;

interface Round {
  n: number;
  code: string;
  words: string;
  jobId?: string;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function SampleCard({ s, picked, onPick, onTry, hotkey }: { s: Sample; picked: boolean; onPick: () => void; onTry: () => void; hotkey?: number }) {
  const liked = useStore((st) => st.likedStyles);
  const [info, setInfo] = useState(false);
  const url = useMemo(() => artUrl({ key: hash(s.words), layers: [{ seed: hash(s.id), jitter: 1 }], w: 512, h: 512 }), [s]);
  return (
    <div className={`sample${picked ? ' picked' : ''}`}>
      <button className="sample-img" onClick={onPick} aria-pressed={picked} aria-label={`Elegir estilo: ${s.words}`}>
        <img src={url} alt="" loading="lazy" />
        {hotkey !== undefined && <span className="hotkey">{hotkey}</span>}
        {picked && <span className="picked-mark">✓</span>}
      </button>
      <div className="sample-actions">
        <button className="pill" onClick={onTry} title="Probar este estilo con tu prompt">
          Probar
        </button>
        <button className="pill" onClick={() => setInfo(!info)} aria-expanded={info}>
          Detalles
        </button>
        <button
          className="icon-btn"
          aria-label="Guardar en estilos que te gustan"
          onClick={() => {
            const st = registerStyle(s.words, `Estilo ${s.atoms.medium}`);
            toggleStyleLike(st.code);
            toast(liked.includes(st.code) ? 'Quitado de tus estilos' : `Guardado en Explorar › Estilos › Me gusta (--sref ${st.code})`);
          }}
        >
          <IconHeart size={14} />
        </button>
      </div>
      {info && <p className="sample-info">{s.words}</p>}
    </div>
  );
}

export function StyleCreator() {
  const jobs = useStore((s) => s.jobs);
  const [prompt, setPrompt] = useState(() => incoming || getState().draft || '');
  const [describe, setDescribe] = useState('');
  const [started, setStarted] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [samples, setSamples] = useState<Sample[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rounds, setRounds] = useState<Round[]>([]);
  const [pinned, setPinned] = useState<Round | null>(null);
  const [hotkeys, setHotkeys] = useState(false);
  const [seed] = useState(() => Date.now() % 1000000);
  const picksSinceRound = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    incoming = '';
  }, []);

  const loadBatch = (sc: Record<string, number>, all: Sample[], pickedNow: Set<string>) => {
    // What you skipped in the last batch counts against its looks (a little).
    const last = all.slice(-BATCH).filter((s) => !pickedNow.has(s.id));
    const next = { ...sc };
    for (const s of last) for (const g of ATOM_GROUPS) next[s.atoms[g]] = (next[s.atoms[g]] ?? 0) - 0.25;
    const r = rng(seed + all.length * 31);
    const fresh = Array.from({ length: BATCH }, (_, i) => makeSample(next, r, all.length + i));
    setScores(next);
    setSamples([...all, ...fresh]);
  };

  // Infinite scroll: more samples when the end comes into view (at most one batch per second).
  const lastLoad = useRef(0);
  useEffect(() => {
    if (!started || !sentinel.current) return;
    const io = new IntersectionObserver((e) => {
      if (!e[0].isIntersecting || Date.now() - lastLoad.current < 1000 || samples.length >= 600) return;
      lastLoad.current = Date.now();
      loadBatch(scores, samples, picked);
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  });

  const start = () => {
    if (!prompt.trim()) {
      toast('Escribe un prompt para ver cómo queda tu estilo.', 'error');
      return;
    }
    // A style description gives the first rounds a head start.
    const sc: Record<string, number> = {};
    const d = describe.toLowerCase();
    for (const g of ATOM_GROUPS) for (const a of ATOMS[g]) if (d && a.split(' ').some((w) => w.length > 3 && d.includes(w))) sc[a] = 1.5;
    setStarted(true);
    setRounds([]);
    setPicked(new Set());
    loadBatch(sc, [], new Set());
  };

  const runRound = (sc: Record<string, number>, fallback: Sample) => {
    const words = learnedWords(sc) || fallback.words;
    const n = rounds.length + 1;
    const st = registerStyle(words, `Mi estilo · ronda ${n}`);
    // A prompt that already has --sref keeps it: both codes stay active.
    const base = prompt.trim();
    const p = /--sref\s/.test(base) ? base.replace(/--sref\s+([^-]+)/, (_m, c: string) => `--sref ${c.trim()} ${st.code} `) : `${base} --sref ${st.code}`;
    const made = runAction('imagine', { prompt: p });
    setRounds((r) => [{ n, code: st.code, words, jobId: made[0]?.id }, ...r]);
  };

  const pick = (s: Sample) => {
    const next = new Set(picked);
    const sc = { ...scores };
    const delta = next.has(s.id) ? -1 : 1;
    if (delta > 0) next.add(s.id);
    else next.delete(s.id);
    for (const g of ATOM_GROUPS) sc[s.atoms[g]] = (sc[s.atoms[g]] ?? 0) + delta;
    setPicked(next);
    setScores(sc);
    if (delta > 0 && ++picksSinceRound.current >= PICKS_PER_ROUND) {
      picksSinceRound.current = 0;
      runRound(sc, s);
    }
  };

  const tryOne = (s: Sample) => {
    const st = registerStyle(s.words, `Estilo ${s.atoms.medium}`);
    runAction('imagine', { prompt: `${prompt.trim()} --sref ${st.code}` });
    toast(`Probando --sref ${st.code} (lo verás en Crear)`);
  };

  // Hotkeys: 1–9 and 0 pick from the newest samples.
  const lastBatch = samples.slice(-BATCH);
  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key === '0' ? 10 : Number(e.key);
      if (k >= 1 && k <= 10 && lastBatch[k - 1]) pick(lastBatch[k - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const jobOf = (r: Round) => jobs.find((j) => j.id === r.jobId);

  if (!started) {
    return (
      <div className="page">
        <h1>Creador de estilos</h1>
        <p className="lead">
          Elige las muestras cuyo estilo te guste (no su contenido). Cada {PICKS_PER_ROUND} elecciones se crea un código <code>--sref</code> nuevo y se genera tu prompt con él; aprende tanto de lo que eliges como de lo que pasas. Suele estabilizarse en 5–10 rondas.
        </p>
        <div className="card">
          <label className="field wide">
            Prompt para las vistas previas
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Un prompt sencillo muestra mejor el estilo, p. ej. «un faro junto al mar»" />
          </label>
          <label className="field wide" style={{ marginTop: 12 }}>
            Descripción del estilo (opcional)
            <input value={describe} onChange={(e) => setDescribe(e.target.value)} placeholder="p. ej. acuarela, tonos pastel, luz suave" />
          </label>
          <p className="hint" style={{ marginTop: 8 }}>
            Añade --draft al prompt para vistas previas más rápidas. Si el prompt ya tiene --sref, el código nuevo se suma al anterior.
          </p>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={start}>
            Empezar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="creator">
      <div className="creator-main">
        <div className="toolbar">
          <div>
            <h1 className="creator-title">Creador de estilos</h1>
            <p className="hint">
              «{prompt}» · {picked.size} elegidas · ronda {rounds.length}
              {picksSinceRound.current ? ` · ${PICKS_PER_ROUND - picksSinceRound.current} para la siguiente` : ''}
            </p>
          </div>
          <div className="row">
            <label className="switch small" title="Teclas 1–9 y 0 para elegir entre las últimas muestras">
              <input type="checkbox" checked={hotkeys} onChange={(e) => setHotkeys(e.target.checked)} /> Atajos de teclado
            </label>
            <button
              className="btn small primary"
              onClick={() => {
                if (rounds.length) toast('Sesión terminada: tus vistas previas y códigos están en Crear.');
                setStarted(false);
                navigate('imagine');
              }}
            >
              Terminar sesión
            </button>
          </div>
        </div>
        <div className="samples">
          {samples.map((s, i) => {
            const inLast = i >= samples.length - BATCH;
            const hk = hotkeys && inLast ? ((i - (samples.length - BATCH) + 1) % 10) : undefined;
            return <SampleCard key={s.id} s={s} picked={picked.has(s.id)} onPick={() => pick(s)} onTry={() => tryOne(s)} hotkey={hk} />;
          })}
        </div>
        <div ref={sentinel} className="sentinel">
          <button className="btn" onClick={() => loadBatch(scores, samples, picked)}>
            Más muestras
          </button>
        </div>
      </div>
      <aside className="creator-side" aria-label="Vistas previas">
        <h2 className="day">Vistas previas</h2>
        {pinned && (
          <div className="pinned">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Ronda {pinned.n}</strong>
              <button className="icon-btn tiny" aria-label="Soltar" onClick={() => setPinned(null)}>
                <IconClose size={12} />
              </button>
            </div>
            {jobOf(pinned)
              ?.images.slice(0, 3)
              .map((im, k) => (
                <div key={k} className="pinned-img">
                  <Media img={im} alt={`Ronda ${pinned.n}`} />
                </div>
              ))}
          </div>
        )}
        {rounds.length === 0 && <p className="hint">Elige {PICKS_PER_ROUND} muestras para la primera ronda.</p>}
        {rounds.map((r) => {
          const job = jobOf(r);
          const first = job?.images[0];
          return (
            <div key={r.n} className="round">
              <button className="round-thumb" onClick={() => setPinned(r)} title="Fijar las imágenes de esta ronda" disabled={!first}>
                {first ? <Media img={first} alt={`Ronda ${r.n}`} /> : <span className="placeholder" style={{ display: 'block', width: '100%', height: '100%' }} />}
              </button>
              <div className="round-info">
                <strong>Ronda {r.n}</strong>
                <button
                  className="link-btn"
                  onClick={() => {
                    const d = getState().draft.trim();
                    setDraft(`${d} --sref ${r.code}`.trim());
                    toast(`--sref ${r.code} añadido a la barra`);
                  }}
                >
                  --sref {r.code}
                </button>
                <span className="hint">{job?.status === 'done' ? r.words : `${Math.round((job?.progress ?? 0) * 100)}%`}</span>
              </div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}
