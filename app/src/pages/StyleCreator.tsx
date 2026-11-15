import { useEffect, useRef, useState } from 'react';
import { IconHeart, IconClose } from '../icons';
import { getState, runAction, setDraft, toast, toggleStyleLike, useStore } from '../store';
import { navigate } from '../router';
import { Media } from '../components/Media';
import { previewKey, randomCode, requestPreview, styleLabels, styleTitle, usePreviews, type StylePreview } from '../stylePreviews';

/* Open the Style Creator with a prompt (from the Create page). */
let incoming = '';
export function openStyleCreator(prompt: string) {
  incoming = prompt;
  navigate('style-creator');
}

const BATCH = 8;
const PICKS_PER_ROUND = 4;
/** A round mixes the codes picked last; more would wash every style out. */
const MAX_MIX = 8;

interface Round {
  n: number;
  /** The --sref value: the picked codes, mixed. */
  sref: string;
  jobId?: string;
}

const withoutSref = (prompt: string) => prompt.replace(/\s--sref(\s+[^-\s]+)+/g, '').trim();

function SampleCard({ code, p, picked, onPick, onTry, hotkey }: { code: string; p?: StylePreview; picked: boolean; onPick: () => void; onTry: () => void; hotkey?: number }) {
  const liked = useStore((st) => st.likedStyles);
  const [info, setInfo] = useState(false);
  const ready = p?.status === 'done' && p.image;
  return (
    <div className={`sample${picked ? ' picked' : ''}`}>
      <button className="sample-img" onClick={onPick} aria-pressed={picked} aria-label={`Elegir estilo --sref ${code}`} disabled={!ready}>
        {ready ? <Media img={p.image!} alt="" /> : <span className="placeholder style-pending">{p?.status === 'error' ? 'Error' : p?.status === 'running' ? 'Generando…' : 'En cola'}</span>}
        {hotkey !== undefined && <span className="hotkey">{hotkey}</span>}
        {picked && <span className="picked-mark">✓</span>}
      </button>
      <div className="sample-actions">
        <button className="pill" onClick={onTry} title="Probar este código con tu prompt">
          Probar
        </button>
        <button className="pill" onClick={() => setInfo(!info)} aria-expanded={info}>
          Detalles
        </button>
        <button
          className={`icon-btn${liked.includes(code) ? ' on' : ''}`}
          aria-label="Guardar en estilos que te gustan"
          onClick={() => {
            toggleStyleLike(code);
            toast(liked.includes(code) ? 'Quitado de tus estilos' : `Guardado en Explorar › Estilos › Me gusta (--sref ${code})`);
          }}
        >
          <IconHeart size={14} filled={liked.includes(code)} />
        </button>
      </div>
      {info && (
        <p className="sample-info">
          --sref {code}
          {styleLabels(p?.styles).map((s) => ` · ${s.label} ${s.weight.toFixed(2)}`)}
        </p>
      )}
    </div>
  );
}

/** Pick the samples whose look you like: each sample is a random --sref code rendered on your prompt;
    every few picks a round renders your prompt with the picked codes mixed. */
export function StyleCreator() {
  const jobs = useStore((s) => s.jobs);
  const previews = usePreviews();
  const [prompt, setPrompt] = useState(() => withoutSref(incoming || getState().draft || ''));
  const [started, setStarted] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [pinned, setPinned] = useState<Round | null>(null);
  const [hotkeys, setHotkeys] = useState(false);
  const picksSinceRound = useRef(0);

  useEffect(() => {
    incoming = '';
  }, []);

  const preview = (code: string) => previews[previewKey(code, prompt)];
  // The next batch waits for this one, so the queue never runs far ahead of what you see.
  const busy = codes.some((c) => preview(c)?.status === 'queued' || preview(c)?.status === 'running');

  const loadBatch = () => {
    const fresh = Array.from({ length: BATCH }, randomCode);
    fresh.forEach((c) => requestPreview(c, prompt));
    setCodes((all) => [...all, ...fresh]);
  };

  const start = () => {
    if (!prompt.trim()) {
      toast('Escribe un prompt para ver cómo queda cada estilo.', 'error');
      return;
    }
    setStarted(true);
    setRounds([]);
    setPicked([]);
    setCodes([]);
    picksSinceRound.current = 0;
    loadBatch();
  };

  const runRound = (all: string[]) => {
    const sref = all.slice(-MAX_MIX).join(' ');
    const n = rounds.length + 1;
    const made = runAction('imagine', { prompt: `${prompt.trim()} --sref ${sref}` });
    setRounds((r) => [{ n, sref, jobId: made[0]?.id }, ...r]);
  };

  const pick = (code: string) => {
    if (picked.includes(code)) {
      setPicked(picked.filter((c) => c !== code));
      return;
    }
    const next = [...picked, code];
    setPicked(next);
    if (++picksSinceRound.current >= PICKS_PER_ROUND) {
      picksSinceRound.current = 0;
      runRound(next);
    }
  };

  const tryOne = (code: string) => {
    runAction('imagine', { prompt: `${prompt.trim()} --sref ${code}` });
    toast(`Probando --sref ${code} (lo verás en Crear)`);
  };

  // Hotkeys: 1–9 and 0 pick from the newest samples.
  const lastBatch = codes.slice(-BATCH);
  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key === '0' ? 10 : Number(e.key);
      if (k >= 1 && k <= 10 && lastBatch[k - 1] && preview(lastBatch[k - 1])?.status === 'done') pick(lastBatch[k - 1]);
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
          Cada muestra es un código <code>--sref</code> al azar generado con tu prompt. Elige las que tengan un estilo que te guste (no por su contenido): cada {PICKS_PER_ROUND} elecciones se genera tu prompt con los códigos elegidos mezclados, y ese <code>--sref</code> es tu estilo.
        </p>
        <div className="card">
          <label className="field wide">
            Prompt para las muestras
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Un prompt sencillo muestra mejor el estilo, p. ej. «un faro junto al mar»" />
          </label>
          <p className="hint" style={{ marginTop: 8 }}>
            Las muestras se generan una a una en tamaño borrador con H3 Image, siempre con la misma semilla; las rondas, con tus ajustes normales.
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
              «{prompt}» · {picked.length} elegidas · ronda {rounds.length}
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
                if (rounds.length) toast('Sesión terminada: tus rondas y sus --sref están en Crear.');
                setStarted(false);
                navigate('imagine');
              }}
            >
              Terminar sesión
            </button>
          </div>
        </div>
        <div className="samples">
          {codes.map((code, i) => {
            const inLast = i >= codes.length - BATCH;
            const hk = hotkeys && inLast ? (i - (codes.length - BATCH) + 1) % 10 : undefined;
            return <SampleCard key={code} code={code} p={preview(code)} picked={picked.includes(code)} onPick={() => pick(code)} onTry={() => tryOne(code)} hotkey={hk} />;
          })}
        </div>
        <div className="sentinel">
          <button className="btn" onClick={loadBatch} disabled={busy}>
            {busy ? 'Generando muestras…' : 'Más muestras'}
          </button>
        </div>
      </div>
      <aside className="creator-side" aria-label="Rondas">
        <h2 className="day">Rondas</h2>
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
                    setDraft(`${withoutSref(getState().draft)} --sref ${r.sref}`.trim());
                    toast(`--sref ${r.sref} añadido a la barra`);
                  }}
                >
                  --sref {r.sref}
                </button>
                <span className="hint">{job?.status === 'done' ? styleTitle(job.styleList) : `${Math.round((job?.progress ?? 0) * 100)}%`}</span>
              </div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}
