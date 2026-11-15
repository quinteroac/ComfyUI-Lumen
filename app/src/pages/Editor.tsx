import { useCallback, useEffect, useRef, useState } from 'react';
import { IconBrush, IconEraser, IconMove, IconRedo, IconUndo, IconUpload, IconDownload } from '../icons';
import { openEditor, runAction, toast, useStore, type EditorTarget } from '../store';
import { navigate } from '../router';
import type { JobImage } from '../comfy/types';

type Tool = 'move' | 'erase' | 'restore';
interface Snap {
  erase: ImageData;
  scale: number;
  ox: number;
  oy: number;
  aspect: number;
}

const PRESETS: [string, number | null][] = [
  ['Original', null],
  ['1:1', 1],
  ['4:5', 4 / 5],
  ['2:3', 2 / 3],
  ['9:16', 9 / 16],
  ['3:2', 3 / 2],
  ['16:9', 16 / 9],
];
const MAX_OUT = 2048;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('No se pudo abrir la imagen.'));
    img.src = url;
  });
}

/** Picks an image to edit: upload, or one of your recent images. */
function Picker() {
  const jobs = useStore((s) => s.jobs);
  const file = useRef<HTMLInputElement>(null);
  const recent = jobs
    .filter((j) => j.status === 'done')
    .flatMap((j) => j.images.map((img, index) => ({ img, j, index })))
    .filter(({ img }) => img.kind !== 'video' && !img.trashed)
    .slice(0, 18);
  const fromFile = (f?: File) => {
    if (!f || !f.type.startsWith('image/')) return;
    const url = URL.createObjectURL(f);
    loadImage(url).then((im) => openEditor({ image: { url, w: im.naturalWidth, h: im.naturalHeight }, prompt: '' }));
  };
  return (
    <div className="page">
      <h1>Editor</h1>
      <p className="lead">Borra zonas para regenerarlas, cambia la proporción o aleja la imagen, y escribe qué quieres ver. Se envía a ComfyUI como un único trabajo de edición.</p>
      <div
        className="drop-area"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          fromFile(e.dataTransfer.files?.[0]);
        }}
      >
        <IconUpload size={28} />
        <p>Arrastra una imagen aquí o</p>
        <button className="btn primary" onClick={() => file.current?.click()}>
          Subir imagen
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
      </div>
      {recent.length > 0 && (
        <>
          <h2 className="day">O elige una de tus imágenes</h2>
          <div className="grid">
            {recent.map(({ img, j, index }) => (
              <button key={`${j.id}-${index}`} className="job-img" onClick={() => openEditor({ image: img, prompt: j.rawPrompt, source: { jobId: j.id, index } })} aria-label={j.prompt}>
                <img src={img.url} alt={j.prompt} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Canvas({ target, img }: { target: EditorTarget; img: HTMLImageElement }) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const view = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const erase = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const [tool, setTool] = useState<Tool>('erase');
  const [brush, setBrush] = useState(40);
  const [scale, setScale] = useState(1);
  const [aspect, setAspect] = useState(iw / ih);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [prompt, setPrompt] = useState(target.prompt);
  const [hist, setHist] = useState<{ stack: Snap[]; at: number }>({ stack: [], at: -1 });
  const [, force] = useState(0);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [box, setBox] = useState({ w: 640, h: 480 });

  // Canvas size in image pixels: same area as the image divided by scale², with the chosen shape.
  const area = (iw * ih) / (scale * scale);
  const cw = Math.round(Math.sqrt(area * aspect));
  const ch = Math.round(Math.sqrt(area / aspect));
  const k = Math.min(box.w / cw, box.h / ch);
  const ix = (cw - iw) / 2 + off.x;
  const iy = (ch - ih) / 2 + off.y;

  useEffect(() => {
    erase.current.width = iw;
    erase.current.height = ih;
    const snap: Snap = { erase: erase.current.getContext('2d')!.getImageData(0, 0, iw, ih), scale: 1, ox: 0, oy: 0, aspect: iw / ih };
    setHist({ stack: [snap], at: 0 });
  }, [iw, ih]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: Math.max(200, el.clientWidth), h: Math.max(200, Math.min(window.innerHeight * 0.62, el.clientWidth)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** The image with erased parts cut out. */
  const holed = useCallback(() => {
    const c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(erase.current, 0, 0);
    return c;
  }, [img, iw, ih]);

  useEffect(() => {
    const c = view.current;
    if (!c) return;
    c.width = Math.round(cw * k);
    c.height = Math.round(ch * k);
    const x = c.getContext('2d')!;
    // Checkerboard = areas that will be generated.
    const s = 12;
    for (let yy = 0; yy < c.height; yy += s) for (let xx = 0; xx < c.width; xx += s) {
      x.fillStyle = ((xx + yy) / s) % 2 ? '#d9d9de' : '#f2f2f4';
      x.fillRect(xx, yy, s, s);
    }
    x.drawImage(holed(), ix * k, iy * k, iw * k, ih * k);
  });

  const push = (p: Partial<Snap> = {}) => {
    const snap: Snap = {
      erase: erase.current.getContext('2d')!.getImageData(0, 0, iw, ih),
      scale,
      ox: off.x,
      oy: off.y,
      aspect,
      ...p,
    };
    setHist((h) => ({ stack: [...h.stack.slice(0, h.at + 1), snap].slice(-40), at: Math.min(h.at + 1, 39) }));
  };
  const restore = (s: Snap) => {
    erase.current.getContext('2d')!.putImageData(s.erase, 0, 0);
    setScale(s.scale);
    setOff({ x: s.ox, y: s.oy });
    setAspect(s.aspect);
    force((n) => n + 1);
  };
  const undo = () => hist.at > 0 && (restore(hist.stack[hist.at - 1]), setHist((h) => ({ ...h, at: h.at - 1 })));
  const redo = () => hist.at < hist.stack.length - 1 && (restore(hist.stack[hist.at + 1]), setHist((h) => ({ ...h, at: h.at + 1 })));
  const reset = () => {
    erase.current.getContext('2d')!.clearRect(0, 0, iw, ih);
    setScale(1);
    setOff({ x: 0, y: 0 });
    setAspect(iw / ih);
    push({ scale: 1, ox: 0, oy: 0, aspect: iw / ih, erase: new ImageData(iw, ih) });
  };

  const toImage = (e: React.PointerEvent) => {
    const r = view.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k - ix, y: (e.clientY - r.top) / k - iy };
  };
  const paint = (e: React.PointerEvent, from?: { x: number; y: number }) => {
    const p = toImage(e);
    const x = erase.current.getContext('2d')!;
    x.globalCompositeOperation = tool === 'erase' ? 'source-over' : 'destination-out';
    x.strokeStyle = x.fillStyle = '#000';
    x.lineWidth = brush / k;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(from?.x ?? p.x, from?.y ?? p.y);
    x.lineTo(p.x, p.y);
    x.stroke();
    force((n) => n + 1);
    return p;
  };
  const last = useRef<{ x: number; y: number } | null>(null);

  const exportPng = (): { url: string; w: number; h: number } => {
    const o = Math.min(1, MAX_OUT / Math.max(cw, ch));
    const w = Math.round((cw * o) / 8) * 8, h = Math.round((ch * o) / 8) * 8;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(holed(), ix * (w / cw), iy * (h / ch), iw * (w / cw), ih * (h / ch));
    return { url: c.toDataURL('image/png'), w, h };
  };

  const submit = () => {
    let out;
    try {
      out = exportPng();
    } catch {
      toast('No se pudo leer la imagen (permiso del navegador).', 'error');
      return;
    }
    if (!prompt.trim()) {
      toast('Escribe qué quieres ver en la imagen editada.', 'error');
      return;
    }
    const image: JobImage = { url: target.image.url, w: iw, h: ih };
    const jobs = runAction('edit', { prompt, mask: out.url, maskSize: { w: out.w, h: out.h }, source: target.source, image: target.source ? undefined : image });
    if (jobs.length) navigate('imagine');
  };

  return (
    <div className="editor">
      <div className="editor-tools" role="toolbar" aria-label="Herramientas del editor">
        <div className="seg">
          <button className={tool === 'move' ? 'on' : ''} onClick={() => setTool('move')} title="Mover / escalar">
            <IconMove size={16} /> Mover
          </button>
          <button className={tool === 'erase' ? 'on' : ''} onClick={() => setTool('erase')} title="Borrar: las zonas borradas se regeneran">
            <IconEraser size={16} /> Borrar
          </button>
          <button className={tool === 'restore' ? 'on' : ''} onClick={() => setTool('restore')} title="Restaurar zonas borradas">
            <IconBrush size={16} /> Restaurar
          </button>
        </div>
        {tool === 'move' ? (
          <label className="slider inline">
            <span>Escala {Math.round(scale * 100)}%</span>
            <input type="range" min={0.25} max={1} step={0.01} value={scale} onChange={(e) => setScale(Number(e.target.value))} onPointerUp={() => push()} />
          </label>
        ) : (
          <label className="slider inline">
            <span>Pincel {brush}px</span>
            <input type="range" min={5} max={150} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
          </label>
        )}
        <div className="row">
          <button className="icon-btn" aria-label="Deshacer" title="Deshacer" onClick={undo} disabled={hist.at <= 0}>
            <IconUndo size={18} />
          </button>
          <button className="icon-btn" aria-label="Rehacer" title="Rehacer" onClick={redo} disabled={hist.at >= hist.stack.length - 1}>
            <IconRedo size={18} />
          </button>
          <button className="btn small" onClick={reset}>
            Restablecer
          </button>
        </div>
      </div>
      {tool === 'move' && (
        <div className="tabs" style={{ marginBottom: 8 }}>
          {PRESETS.map(([label, a]) => {
            const val = a ?? iw / ih;
            return (
              <button
                key={label}
                className={`tab${Math.abs(aspect - val) < 0.01 ? ' on' : ''}`}
                onClick={() => {
                  setAspect(val);
                  push({ aspect: val });
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div ref={wrap} className="editor-stage">
        <canvas
          ref={view}
          className={`editor-canvas ${tool}`}
          aria-label="Lienzo del editor"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            if (tool === 'move') drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
            else last.current = paint(e);
          }}
          onPointerMove={(e) => {
            if (tool === 'move' && drag.current) setOff({ x: drag.current.ox + (e.clientX - drag.current.x) / k, y: drag.current.oy + (e.clientY - drag.current.y) / k });
            else if (last.current) last.current = paint(e, last.current);
          }}
          onPointerUp={() => {
            if (drag.current || last.current) push();
            drag.current = null;
            last.current = null;
          }}
        />
      </div>
      <p className="hint">
        Lienzo {cw}×{ch}px · las zonas a cuadros (borradas o vacías) se generarán de nuevo.
      </p>
      <div className="field wide" style={{ marginTop: 12 }}>
        <label htmlFor="edit-prompt">Editar prompt</label>
        <textarea id="edit-prompt" className="edit-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe la imagen completa que quieres ver" />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" data-action="edit" onClick={submit}>
          Enviar edición
        </button>
        <button
          className="btn"
          onClick={() => {
            try {
              const a = document.createElement('a');
              a.href = exportPng().url;
              a.download = `lumen-edicion-${Date.now()}.png`;
              a.click();
            } catch {
              toast('No se pudo exportar la imagen.', 'error');
            }
          }}
        >
          <IconDownload size={15} /> Descargar edición
        </button>
        <button className="btn" onClick={() => openEditor(undefined)}>
          Elegir otra imagen
        </button>
      </div>
    </div>
  );
}

export function Editor() {
  const target = useStore((s) => s.editor);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setImg(null);
    setError('');
    if (target) loadImage(target.image.url).then(setImg, (e) => setError(e.message));
  }, [target]);
  if (!target) return <Picker />;
  return (
    <div className="page">
      <h1>Editor</h1>
      {error ? <p className="err">{error}</p> : img ? <Canvas key={target.image.url} target={target} img={img} /> : <p className="hint">Cargando imagen…</p>}
    </div>
  );
}
