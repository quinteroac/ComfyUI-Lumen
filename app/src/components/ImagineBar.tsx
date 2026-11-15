import { useEffect, useRef, useState } from 'react';
import { IconClose, IconImage, IconLock, IconSend, IconSliders, IconTrash, IconVideo, IconBolt, IconFolder, IconSparkle, IconChat, IconMic, IconUser } from '../icons';
import {
  addRef,
  cancelPending,
  clearRefs,
  openFolder,
  removeRef,
  runAction,
  setDraft,
  setLoop,
  setSettings,
  submitBar,
  toggleDraftMode,
  toggleMoodboardDefault,
  togglePersonalization,
  toggleProfileDefault,
  isUnlocked,
  UNLOCK_PICKS,
  sendToAssistant,
  toggleConversational,
  clearChat,
  toast,
  toggleRefsLock,
  useStore,
  type RefSlot,
} from '../store';
import { DEFAULT_SETTINGS, type CreateSettings, type RefImage } from '../comfy/types';
import { navigate, useRoute } from '../router';

const ASPECTS = ['1:2', '9:16', '2:3', '3:4', '4:5', '1:1', '5:4', '4:3', '3:2', '16:9', '2:1'];

function AspectPreview({ aspect }: { aspect: string }) {
  const [a, b] = aspect.split(':').map(Number);
  const max = 72;
  const w = a >= b ? max : Math.round((max * a) / b);
  const h = b >= a ? max : Math.round((max * b) / a);
  return (
    <div className="aspect-box">
      <div className="aspect-shape" style={{ width: w, height: h }}>
        {aspect}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="slider">
      <div className="slider-head">
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

export function ParamsPanel({ s }: { s: CreateSettings }) {
  const ai = ASPECTS.indexOf(s.aspect);
  return (
    <div className="params">
      <div>
        <div className="param-title">Proporción</div>
        <AspectPreview aspect={s.aspect} />
        <input
          type="range"
          aria-label="Proporción de la imagen"
          min={0}
          max={ASPECTS.length - 1}
          value={ai === -1 ? 5 : ai}
          onChange={(e) => setSettings({ aspect: ASPECTS[Number(e.target.value)] })}
        />
        <Seg
          label="Orientación"
          value={ASPECTS.indexOf(s.aspect) < 5 ? 'portrait' : s.aspect === '1:1' ? 'square' : 'landscape'}
          onChange={(v) => setSettings({ aspect: v === 'portrait' ? '2:3' : v === 'square' ? '1:1' : '3:2' })}
          options={[
            ['portrait', 'Vertical'],
            ['square', 'Cuadrado'],
            ['landscape', 'Horizontal'],
          ]}
        />
      </div>
      <div>
        <div className="param-title">Variación</div>
        <Slider label="Variedad" value={s.chaos} min={0} max={100} onChange={(v) => setSettings({ chaos: v })} />
      </div>
      <div className="col-3">
        <div className="param-title">Modelo</div>
        <Row label="Imagen">
          <Seg label="Resolución de imagen" value={s.resolution} onChange={(v) => setSettings({ resolution: v })} options={[['sd', 'SD'], ['hd', 'HD']]} />
        </Row>
        <Row label="Imágenes">
          <Seg label="Imágenes por creación" value={s.grid} onChange={(v) => setSettings({ grid: v })} options={[[1, '1'], [2, '2'], [3, '3'], [4, '4']]} />
        </Row>
        <div className="param-title">Más opciones</div>
        <Row label="Vídeo · resolución">
          <Seg label="Resolución de vídeo" value={s.videoResolution} onChange={(v) => setSettings({ videoResolution: v })} options={[['sd', 'SD'], ['hd', 'HD']]} />
        </Row>
        <Row label="Vídeo · lote">
          <Seg label="Vídeos por prompt" value={s.videoBatch} onChange={(v) => setSettings({ videoBatch: v })} options={[[1, '1'], [2, '2'], [4, '4']]} />
        </Row>
        <Row label="Vídeo · movimiento">
          <Seg label="Movimiento" value={s.motion} onChange={(v) => setSettings({ motion: v })} options={[['low', 'Bajo'], ['high', 'Alto']]} />
        </Row>
      </div>
      <div className="params-foot">
        <span>
          Parámetros en el prompt: --ar 16:9 · --seed 42 · --c 20 · --r 3 · --iw 1.5 · --cw 50 · --hd · --draft · --anima · --moss · --sref código · --iw 1.5 · --video --motion high --bs 2 --loop · {'{rojo, azul}'} · espacio::2 barco
        </span>
        <button className="link-btn" type="button" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>
          Restablecer
        </button>
      </div>
    </div>
  );
}

const SLOT_LABEL: Record<RefSlot | 'describe', string> = {
  images: 'Prompt de imagen',
  style: 'Referencia de estilo',
  character: 'Personaje (--cref)',
  start: 'Fotograma inicial (animar)',
  end: 'Fotograma final',
  describe: 'Describir',
};

function readFile(f: File): Promise<Omit<RefImage, 'id'>> {
  return new Promise((res, rej) => {
    if (!f.type.startsWith('image/')) return rej(new Error('No es una imagen'));
    if (f.size > 10 * 1024 * 1024) return rej(new Error('La imagen supera 10 MB'));
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => res({ url, w: img.naturalWidth, h: img.naturalHeight, blob: f, name: f.name });
    img.onerror = () => rej(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

function readUrl(url: string): Promise<Omit<RefImage, 'id'>> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res({ url, w: img.naturalWidth || 1024, h: img.naturalHeight || 1024, name: `ref_${Date.now()}.png` });
    img.onerror = () => rej(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

/** Images dropped or picked for a slot (files, or images dragged from the page). */
async function readDrop(dt: DataTransfer): Promise<Omit<RefImage, 'id'>[]> {
  const files = [...(dt.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) return Promise.all(files.map(readFile));
  const url = dt.getData('text/uri-list') || dt.getData('text/plain');
  if (url && /^(data:image|https?:|blob:)/.test(url.trim())) return [await readUrl(url.trim())];
  return [];
}

function Zone({ slot, onDescribe }: { slot: RefSlot | 'describe'; onDescribe: (img: Omit<RefImage, 'id'>) => void }) {
  const refs = useStore((s) => s.refs);
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const items: RefImage[] = slot === 'describe' ? [] : slot === 'images' || slot === 'style' || slot === 'character' ? refs[slot] : refs[slot] ? [refs[slot]!] : [];
  const take = (imgs: Omit<RefImage, 'id'>[]) => {
    for (const im of imgs) {
      if (slot === 'describe') onDescribe(im);
      else addRef(slot, im);
    }
  };
  return (
    <div
      className={`zone${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        try {
          take(await readDrop(e.dataTransfer));
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <div className="zone-head">
        <span>{SLOT_LABEL[slot]}</span>
        {slot === 'end' && (
          <label className="switch small">
            <input type="checkbox" checked={refs.loop} onChange={(e) => setLoop(e.target.checked)} /> Bucle
          </label>
        )}
      </div>
      <div className="zone-body">
        {items.map((r) => (
          <div className="attach-chip" key={r.id}>
            <img src={r.url} alt={SLOT_LABEL[slot]} />
            <button type="button" aria-label="Quitar imagen" onClick={() => removeRef(slot as RefSlot, r.id)}>
              <IconClose size={14} />
            </button>
          </div>
        ))}
        {!(slot === 'end' && refs.loop) && (
          <button type="button" className="zone-add" onClick={() => file.current?.click()} aria-label={`Subir imagen: ${SLOT_LABEL[slot]}`}>
            +
          </button>
        )}
        {slot === 'end' && refs.loop && <span className="hint">Usa el fotograma inicial</span>}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple={slot === 'images' || slot === 'style' || slot === 'character'}
        hidden
        onChange={async (e) => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = '';
          try {
            take(await Promise.all(fs.map(readFile)));
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
          }
        }}
      />
    </div>
  );
}

/** Personalization: on/off + which moodboards are used by default. */
function PersonalizeButton() {
  const on = useStore((s) => s.personalization);
  const boards = useStore((s) => s.moodboards);
  const profiles = useStore((s) => s.profiles);
  const [open, setOpen] = useState(false);
  const defaults = [...profiles.filter((p) => p.isDefault && isUnlocked(p)), ...boards.filter((b) => b.isDefault)];
  return (
    <div className="menu-wrap personalize">
      <span className="split">
        <button
          type="button"
          className={`icon-btn${on ? ' on accent' : ''}`}
          aria-pressed={on}
          aria-label="Personalización (perfiles y moodboards)"
          title={on ? `Personalización activada: ${defaults.map((d) => d.name).join(', ') || 'nada seleccionado'}` : 'Personalización desactivada'}
          onClick={togglePersonalization}
        >
          <IconSparkle />
        </button>
        <button type="button" className="icon-btn caret" aria-label="Elegir moodboards predeterminados" aria-expanded={open} onClick={() => setOpen(!open)}>
          ▾
        </button>
      </span>
      {open && (
        <div className="menu up" role="menu">
          <span className="menu-label">Perfiles predeterminados</span>
          {profiles.map((p) => (
            <button key={p.id} role="menuitemcheckbox" aria-checked={p.isDefault} onClick={() => toggleProfileDefault(p.id)} disabled={!isUnlocked(p)} title={isUnlocked(p) ? '' : 'Aún bloqueado'}>
              {p.isDefault ? '✓' : '○'} {p.name} <span className="count">{isUnlocked(p) ? '' : `🔒 ${p.picks}/${UNLOCK_PICKS}`}</span>
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('personalize');
            }}
          >
            Gestionar perfiles…
          </button>
          <span className="menu-label">Moodboards predeterminados</span>
          {boards.length === 0 && <p className="hint">Aún no tienes moodboards.</p>}
          {boards.map((b) => (
            <button key={b.id} role="menuitemcheckbox" aria-checked={b.isDefault} onClick={() => toggleMoodboardDefault(b.id)}>
              {b.isDefault ? '✓' : '○'} {b.name} <span className="count">{b.images.length}</span>
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('moodboards');
            }}
          >
            Gestionar moodboards…
          </button>
        </div>
      )}
    </div>
  );
}

function RefStrip() {
  const refs = useStore((s) => s.refs);
  const all: { slot: RefSlot; r: RefImage }[] = [
    ...refs.images.map((r) => ({ slot: 'images' as const, r })),
    ...refs.style.map((r) => ({ slot: 'style' as const, r })),
    ...refs.character.map((r) => ({ slot: 'character' as const, r })),
    ...(refs.start ? [{ slot: 'start' as const, r: refs.start }] : []),
    ...(refs.end ? [{ slot: 'end' as const, r: refs.end }] : []),
  ];
  if (!all.length) return null;
  const tag = { images: 'Imagen', style: 'Estilo', character: 'Personaje', start: 'Inicio', end: 'Final' };
  return (
    <div className="ref-strip">
      {all.map(({ slot, r }) => (
        <div className="attach-chip labeled" key={r.id} title={SLOT_LABEL[slot]}>
          <img src={r.url} alt={SLOT_LABEL[slot]} />
          <span>{tag[slot]}</span>
          <button type="button" aria-label="Quitar imagen" onClick={() => removeRef(slot, r.id)}>
            <IconClose size={14} />
          </button>
        </div>
      ))}
      {refs.loop && <span className="chip">bucle</span>}
    </div>
  );
}

/** The parts of the browser's SpeechRecognition used here. */
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

/** Conversation with the assistant (shown above the bar in conversational mode). */
function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [chat.length]);
  return (
    <div className="chat" aria-live="polite">
      {chat.length === 0 && (
        <p className="hint">
          Modo conversacional: describe tu idea con tus palabras y escribiré el prompt por ti. Después puedes pedir cambios («más cálido», «sin personas», «en vertical», «cambia el gato por un zorro») o actuar sobre una imagen («variación de la imagen 2», «anima la 3»).
        </p>
      )}
      {chat.slice(-8).map((t, i) => (
        <div key={i} className={`chat-turn ${t.role}`}>
          <span className="chat-who">{t.role === 'user' ? <IconUser size={14} /> : <IconChat size={14} />}</span>
          <div>
            <p>{t.text}</p>
            {t.prompt && (
              <div className="chat-prompt">
                <code>{t.prompt}</code>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    toggleConversational();
                    setDraft(t.prompt!);
                  }}
                >
                  Editar a mano
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {chat.length > 0 && (
        <button type="button" className="link-btn" onClick={clearChat}>
          Empezar otra conversación
        </button>
      )}
      <div ref={end} />
    </div>
  );
}

export function ImagineBar() {
  const draft = useStore((s) => s.draft);
  const settings = useStore((s) => s.settings);
  const refs = useStore((s) => s.refs);
  const locked = useStore((s) => s.refsLocked);
  const draftMode = useStore((s) => s.draftMode);
  const pending = useStore((s) => s.pending);
  const folderId = useStore((s) => s.currentFolder);
  const folders = useStore((s) => s.folders);
  const conversational = useStore((s) => s.conversational);
  const [open, setOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const route = useRoute();
  const video = settings.output === 'video' || !!refs.start || pending?.kind === 'extend';
  const hasRefs = refs.images.length + refs.style.length > 0 || !!refs.start || !!refs.end;
  const folder = folders.find((f) => f.id === folderId);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [draft]);

  useEffect(() => {
    if (pending) ta.current?.focus();
  }, [pending]);

  const submit = (keep = false) => {
    if (conversational && !pending) {
      void sendToAssistant(draft);
      if (route !== 'imagine') navigate('imagine');
      return;
    }
    const jobs = submitBar(keep);
    if (jobs.length) {
      setImagesOpen(false);
      if (route !== 'imagine') navigate('imagine');
    }
  };

  const describe = (img: Omit<RefImage, 'id'>) => {
    const jobs = runAction('describe', { image: { url: img.url, w: img.w, h: img.h, ref: img.ref } });
    if (jobs.length && route !== 'imagine') navigate('imagine');
  };

  const placeholder =
    pending?.kind === 'remix'
      ? 'Edita el prompt y pulsa Enter para remezclar'
      : pending?.kind === 'extend'
        ? 'Cambia el prompt para alargar el vídeo'
        : conversational
          ? listening
            ? 'Te escucho…'
            : 'Cuéntame tu idea con tus palabras («un faro en una tormenta», «hazlo de noche», «variación de la imagen 2»)'
          : video
            ? refs.start
              ? 'Describe el movimiento (opcional)…'
              : 'Describe el vídeo que quieres crear…'
            : '¿Qué vas a imaginar?';
  const canSend = !!draft.trim() || (!conversational && (!!refs.start || !!pending));

  // Voice (conversational mode): uses the browser's speech recognition; voice needs Draft mode.
  const startVoice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      toast('Tu navegador no permite dictar por voz (prueba con Chrome o Edge).', 'error');
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!draftMode) {
      toggleDraftMode();
      toast('La voz usa el modo borrador: lo he activado.');
    }
    const rec = new Ctor();
    rec.lang = navigator.language || 'es-ES';
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      finalText = t;
      setDraft(t);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) {
        void sendToAssistant(finalText);
        if (route !== 'imagine') navigate('imagine');
      }
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="imagine-wrap">
      <form
        className={`imagine${dragging ? ' dragging' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) {
            setDragging(true);
            setImagesOpen(true);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          // Dropped on the bar (not on a zone): use as image prompt.
          e.preventDefault();
          setDragging(false);
          for (const im of await readDrop(e.dataTransfer).catch(() => [])) addRef('images', im);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
      >
        {conversational && <ChatPanel />}
        {(pending || folder) && (
          <div className="bar-tags">
            {pending && (
              <span className="chip strong">
                {pending.kind === 'remix' ? `Remix · ${pending.strength === 'subtle' ? 'Sutil' : 'Fuerte'}` : 'Alargar vídeo'}
                <img src={pending.image.url} alt="" className="chip-thumb" />
                <button type="button" className="link-btn" onClick={() => setDraft(pending.originalPrompt)}>
                  Restablecer prompt
                </button>
                <button type="button" className="chip-x" aria-label="Cancelar" onClick={cancelPending}>
                  <IconClose size={12} />
                </button>
              </span>
            )}
            {folder && (
              <span className="chip strong">
                <IconFolder size={13} /> Creando en «{folder.name}»
                <button type="button" className="chip-x" aria-label="Salir de la carpeta" onClick={() => openFolder(undefined)}>
                  <IconClose size={12} />
                </button>
              </span>
            )}
          </div>
        )}
        <div className="imagine-row">
          <button
            type="button"
            className={`icon-btn${imagesOpen ? ' on' : ''}${hasRefs ? ' has' : ''}`}
            aria-expanded={imagesOpen}
            aria-label="Imágenes: prompt de imagen, estilo, fotogramas, describir"
            title="Imágenes"
            onClick={() => setImagesOpen((o) => !o)}
          >
            <IconImage />
          </button>
          <label className="sr-only" htmlFor="imagine-input">
            Prompt
          </label>
          <textarea
            id="imagine-input"
            ref={ta}
            rows={1}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e.ctrlKey || e.metaKey);
              }
            }}
          />
          {conversational && (
            <button type="button" className={`icon-btn${listening ? ' on accent rec' : ''}`} aria-pressed={listening} aria-label="Hablar" title={listening ? 'Parar de escuchar' : 'Hablar (usa el modo borrador)'} onClick={startVoice}>
              <IconMic />
            </button>
          )}
          <button
            type="button"
            className={`icon-btn${conversational ? ' on accent' : ''}`}
            aria-pressed={conversational}
            aria-label="Modo conversacional"
            title={conversational ? 'Modo conversacional activado: describe tu idea y escribo el prompt' : 'Modo conversacional'}
            onClick={toggleConversational}
          >
            <IconChat />
          </button>
          <PersonalizeButton />
          <button
            type="button"
            className={`icon-btn${draftMode ? ' on accent' : ''}`}
            aria-pressed={draftMode}
            aria-label="Modo borrador"
            title={draftMode ? 'Modo borrador activado: muchas imágenes rápidas y pequeñas' : 'Modo borrador'}
            onClick={toggleDraftMode}
          >
            <IconBolt />
          </button>
          <button
            type="button"
            className={`icon-btn${video ? ' on accent' : ''}`}
            aria-pressed={video}
            aria-label="Crear vídeo"
            title={video ? 'Modo vídeo (pulsa para volver a imagen)' : 'Crear vídeo'}
            onClick={() => setSettings({ output: settings.output === 'video' ? 'image' : 'video' })}
          >
            <IconVideo />
          </button>
          <button type="button" className={`icon-btn${open ? ' on' : ''}`} aria-expanded={open} aria-label="Ajustes de creación" title="Ajustes de creación" onClick={() => setOpen((o) => !o)}>
            <IconSliders />
          </button>
          <button
            type="submit"
            className="icon-btn send-btn"
            aria-label={video ? 'Crear vídeo' : 'Imaginar'}
            title={`${video ? 'Crear vídeo' : 'Imaginar'} (Enter · Ctrl+Enter mantiene el texto)`}
            disabled={!canSend}
            data-action={pending ? pending.kind : video ? (refs.start ? 'animate' : 'video') : refs.images.length ? 'image_prompt' : 'imagine'}
          >
            <IconSend />
          </button>
        </div>
        {!imagesOpen && <RefStrip />}
        {imagesOpen && (
          <div className="refs-panel">
            <div className="zones">
              <Zone slot="images" onDescribe={describe} />
              <Zone slot="style" onDescribe={describe} />
              <Zone slot="character" onDescribe={describe} />
              <Zone slot="start" onDescribe={describe} />
              <Zone slot="end" onDescribe={describe} />
              <Zone slot="describe" onDescribe={describe} />
            </div>
            <div className="params-foot">
              <span>Arrastra imágenes a cada sección o pulsa +. Máximo 10 MB por imagen.</span>
              <span className="row">
                <button type="button" className={`btn small${locked ? ' primary' : ''}`} onClick={toggleRefsLock} title="Mantener las imágenes para los siguientes prompts">
                  <IconLock size={14} /> {locked ? 'Fijadas' : 'Fijar'}
                </button>
                <button type="button" className="btn small" onClick={clearRefs}>
                  <IconTrash size={14} /> Quitar todas
                </button>
              </span>
            </div>
          </div>
        )}
        {open && <ParamsPanel s={settings} />}
      </form>
    </div>
  );
}
