import { useEffect, useRef, useState } from 'react';
import { setConfig, type ComfyConfig } from '../comfy/config';
import { comboOptions, nodeDefs, testConnection } from '../comfy/client';
import { ACTION_LABELS, type ActionKind, type JobInputs } from '../comfy/types';
import { ACTION_ORDER, PLACEHOLDERS, buildWorkflow, parseWorkflow } from '../comfy/workflows';
import { useConfig } from '../useConfig';
import { baseInputs, getState, parsePrompt, toast } from '../store';

function sampleInputs(action: ActionKind): JobInputs {
  const s = getState();
  const p = parsePrompt(s.draft || 'un faro bajo la aurora --ar 3:2', s.settings);
  return {
    ...baseInputs(action, p, false),
    seed: 123456789,
    batch: 1,
    denoise: action === 'imagine' ? 1 : 0.75,
    image: action === 'imagine' ? undefined : 'lumen_src_ejemplo.png',
    images: action === 'image_prompt' ? ['lumen_src_ejemplo.png'] : [],
    style_images: [],
  };
}

function downloadJson(name: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function WorkflowSlot({ action }: { action: ActionKind }) {
  const cfg = useConfig();
  const value = cfg.workflows[action] ?? '';
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  let error = '';
  if (value.trim()) {
    try {
      parseWorkflow(value);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const save = (text: string) => setConfig({ workflows: { ...cfg.workflows, [action]: text } });

  return (
    <div className="wf-item">
      <div className="wf-head">
        <div>
          <strong>{ACTION_LABELS[action]}</strong>{' '}
          <span className="chip">{value.trim() ? (error ? 'JSON no válido' : 'workflow propio') : 'integrado'}</span>
        </div>
        <div className="row">
          <button className="btn small" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cerrar' : 'Editar'}
          </button>
          <button className="btn small" onClick={() => file.current?.click()}>
            Subir .json
          </button>
          <button
            className="btn small"
            onClick={() => {
              try {
                const { workflow } = buildWorkflow(sampleInputs(action), value);
                setPreview(preview ? null : JSON.stringify({ prompt: workflow, client_id: '…' }, null, 2));
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), 'error');
              }
            }}
          >
            {preview ? 'Ocultar envío' : 'Ver envío'}
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                save(await f.text());
                setOpen(true);
              }
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {open && (
        <div className="field wide" style={{ marginTop: 8 }}>
          <textarea aria-label={`Workflow para ${ACTION_LABELS[action]}`} value={value} placeholder="Pega aquí el JSON de «Export (API)». Vacío = se usa el workflow integrado." onChange={(e) => save(e.target.value)} />
          <div className="row">
            {error && <span className="err">{error}</span>}
            <button className="btn small" onClick={() => downloadJson(`lumen_${action}_integrado.json`, buildWorkflow({ ...sampleInputs(action), prompt: '{{prompt}}', negative: '{{negative}}' }).workflow)}>
              Descargar workflow integrado
            </button>
            {value && (
              <button className="btn small" onClick={() => save('')}>
                Volver al integrado
              </button>
            )}
          </div>
        </div>
      )}
      {preview && <pre className="code">{preview}</pre>}
    </div>
  );
}

type Defs = Awaited<ReturnType<typeof nodeDefs>>;

/** A model file: free text with the server's files as suggestions. */
function ModelField({ label, value, onChange, list }: { label: string; value: string; onChange: (v: string) => void; list: string }) {
  return (
    <label className="field">
      {label}
      <input list={list} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
    </label>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="field">
      {label}
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const MODEL_LISTS: [string, string, string][] = [
  ['unet-list', 'UNETLoader', 'unet_name'],
  ['clip-list', 'CLIPLoader', 'clip_name'],
  ['vae-list', 'VAELoader', 'vae_name'],
  ['lora-list', 'LoraLoaderModelOnly', 'lora_name'],
];

export function ComfySettings() {
  const cfg = useConfig();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [defs, setDefs] = useState<Defs>({});

  useEffect(() => {
    testConnection()
      .then((r) => setStatus({ ok: true, text: `Conectado · ComfyUI ${r.version} · ${r.device}` }))
      .catch((e: Error) => setStatus({ ok: false, text: e.message }));
    nodeDefs().then(setDefs, () => undefined);
  }, []);

  const h3 = (p: Partial<ComfyConfig['h3']>) => setConfig({ h3: { ...cfg.h3, ...p } });
  const anima = (p: Partial<ComfyConfig['anima']>) => setConfig({ anima: { ...cfg.anima, ...p } });
  const moss = (p: Partial<ComfyConfig['moss']>) => setConfig({ moss: { ...cfg.moss, ...p } });
  const samplers = comboOptions(defs, 'KSampler', 'sampler_name');
  const schedulers = comboOptions(defs, 'KSampler', 'scheduler');

  return (
    <div className="page">
      <h1>ComfyUI</h1>
      <p className="lead">Cada botón de generación envía un workflow a este ComfyUI y muestra el progreso en directo. Los ajustes se guardan en tu carpeta de usuario de ComfyUI (lumen/config.json).</p>
      {MODEL_LISTS.map(([id, node, input]) => (
        <datalist id={id} key={id}>
          {comboOptions(defs, node, input).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ))}

      <div className="card">
        <h2>Conexión</h2>
        {status ? <p className={status.ok ? 'ok' : 'err'}>{status.text}</p> : <p className="hint">Comprobando…</p>}
      </div>

      <div className="card">
        <h2>MiniMax H3 Image</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Hace todas las acciones: Imaginar, Prompt de imagen, Variar, Remezclar, Ampliar, Alejar, Desplazar y el Editor. Variar, Remezclar y Ampliar redibujan la imagen desde un paso más tarde de estos sigmas. Alejar y Desplazar ponen la imagen en un lienzo blanco más grande, y el Editor deja en blanco lo borrado; el mejorador de prompt oficial de MiniMax escribe qué debe aparecer ahí.
        </p>
        <div className="form-grid">
          <ModelField label="Modelo" list="unet-list" value={cfg.h3.unet} onChange={(v) => h3({ unet: v })} />
          <ModelField label="Codificador de texto" list="clip-list" value={cfg.h3.clip} onChange={(v) => h3({ clip: v })} />
          <ModelField label="VAE" list="vae-list" value={cfg.h3.vae} onChange={(v) => h3({ vae: v })} />
          <ModelField label="Mejorador de prompt (Alejar, Desplazar, Editor)" list="clip-list" value={cfg.h3.peClip} onChange={(v) => h3({ peClip: v })} />
          <NumberField label="Megapíxeles SD" min={0.25} max={16} step={0.25} value={cfg.h3.sd} onChange={(v) => h3({ sd: v })} />
          <NumberField label="Megapíxeles HD (--hd)" min={0.25} max={16} step={0.25} value={cfg.h3.hd} onChange={(v) => h3({ hd: v })} />
          <NumberField label="LCM s_noise inicio" min={0} max={2} step={0.05} value={cfg.h3.sNoise} onChange={(v) => h3({ sNoise: v })} />
          <NumberField label="LCM s_noise final" min={0} max={2} step={0.05} value={cfg.h3.sNoiseEnd} onChange={(v) => h3({ sNoiseEnd: v })} />
          <label className="field wide">
            Sigmas
            <input value={cfg.h3.sigmas} onChange={(e) => h3({ sigmas: e.target.value })} spellCheck={false} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Anima (--anima) y MOSS Image (--moss)</h2>
        <p className="hint" style={{ marginBottom: 12 }}>Con sus LoRAs rápidas (Anima turbo, 8 pasos; MOSS DMD, 8 pasos). Solo para Imaginar sin imágenes de referencia; todo lo que parte de una imagen se hace con H3 Image.</p>
        <div className="form-grid">
          <ModelField label="Anima · modelo" list="unet-list" value={cfg.anima.unet} onChange={(v) => anima({ unet: v })} />
          <ModelField label="Anima · LoRA turbo (vacío = ninguna)" list="lora-list" value={cfg.anima.lora} onChange={(v) => anima({ lora: v })} />
          <ModelField label="Anima · codificador" list="clip-list" value={cfg.anima.clip} onChange={(v) => anima({ clip: v })} />
          <ModelField label="Anima · VAE" list="vae-list" value={cfg.anima.vae} onChange={(v) => anima({ vae: v })} />
          <NumberField label="Anima · pasos" min={1} max={100} value={cfg.anima.steps} onChange={(v) => anima({ steps: v })} />
          <NumberField label="Anima · CFG" min={1} max={20} step={0.5} value={cfg.anima.cfg} onChange={(v) => anima({ cfg: v })} />
          <label className="field">
            Anima · sampler
            <select value={cfg.anima.sampler} onChange={(e) => anima({ sampler: e.target.value })}>
              {(samplers.length ? samplers : [cfg.anima.sampler]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Anima · scheduler
            <select value={cfg.anima.scheduler} onChange={(e) => anima({ scheduler: e.target.value })}>
              {(schedulers.length ? schedulers : [cfg.anima.scheduler]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <NumberField label="Anima · megapíxeles SD" min={0.25} max={16} step={0.25} value={cfg.anima.sd} onChange={(v) => anima({ sd: v })} />
          <NumberField label="Anima · megapíxeles HD" min={0.25} max={16} step={0.25} value={cfg.anima.hd} onChange={(v) => anima({ hd: v })} />
          <label className="field wide">
            Anima · prompt negativo
            <input value={cfg.anima.negative} onChange={(e) => anima({ negative: e.target.value })} />
          </label>
          <ModelField label="MOSS · modelo" list="unet-list" value={cfg.moss.unet} onChange={(v) => moss({ unet: v })} />
          <ModelField label="MOSS · LoRA DMD (vacío = ninguna)" list="lora-list" value={cfg.moss.lora} onChange={(v) => moss({ lora: v })} />
          <ModelField label="MOSS · codificador" list="clip-list" value={cfg.moss.clip} onChange={(v) => moss({ clip: v })} />
          <ModelField label="MOSS · VAE" list="vae-list" value={cfg.moss.vae} onChange={(v) => moss({ vae: v })} />
          <NumberField label="MOSS · pasos" min={1} max={100} value={cfg.moss.steps} onChange={(v) => moss({ steps: v })} />
          <NumberField label="MOSS · CFG" min={1} max={20} step={0.5} value={cfg.moss.cfg} onChange={(v) => moss({ cfg: v })} />
          <label className="field">
            MOSS · sampler
            <select value={cfg.moss.sampler} onChange={(e) => moss({ sampler: e.target.value })}>
              {(samplers.length ? samplers : [cfg.moss.sampler]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="field">
            MOSS · scheduler
            <select value={cfg.moss.scheduler} onChange={(e) => moss({ scheduler: e.target.value })}>
              {(schedulers.length ? schedulers : [cfg.moss.scheduler]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <NumberField label="MOSS · megapíxeles SD" min={0.25} max={16} step={0.25} value={cfg.moss.sd} onChange={(v) => moss({ sd: v })} />
          <NumberField label="MOSS · megapíxeles HD" min={0.25} max={16} step={0.25} value={cfg.moss.hd} onChange={(v) => moss({ hd: v })} />
          <label className="field wide">
            MOSS · prompt negativo
            <input value={cfg.moss.negative} onChange={(e) => moss({ negative: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Estilos (--sref)</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Cada código --sref elige al azar (siempre los mismos para el mismo código) estilos de la lista del pack Style Code de cada modelo y los mezcla con pesos; varios códigos se mezclan entre sí (--sref 123 456::0.5) y --sref random elige uno. --sw 100 es la fuerza 1.5 del nodo. Solo se aplica al Imaginar y al Prompt de imagen, no a las ediciones.
        </p>
        <div className="form-grid">
          <NumberField label="Estilos por código (H3, MOSS)" min={1} max={8} value={cfg.styleCodes.styles} onChange={(v) => setConfig({ styleCodes: { ...cfg.styleCodes, styles: v } })} />
          <NumberField label="Anima · estilos por código" min={0} max={8} value={cfg.styleCodes.animaStyles} onChange={(v) => setConfig({ styleCodes: { ...cfg.styleCodes, animaStyles: v } })} />
          <NumberField label="Anima · artistas por código" min={0} max={8} value={cfg.styleCodes.animaArtists} onChange={(v) => setConfig({ styleCodes: { ...cfg.styleCodes, animaArtists: v } })} />
          <label className="field wide">
            Prompt de las vistas previas (Explorar › Estilos)
            <input value={cfg.styleCodes.previewPrompt} onChange={(e) => setConfig({ styleCodes: { ...cfg.styleCodes, previewPrompt: e.target.value } })} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Tamaños</h2>
        <div className="form-grid">
          <NumberField label="Megapíxeles en borrador (--draft)" min={0.25} max={4} step={0.25} value={cfg.draftMegapixels} onChange={(v) => setConfig({ draftMegapixels: v })} />
          <NumberField label="Megapíxeles al ampliar" min={1} max={32} step={1} value={cfg.upscaleMegapixels} onChange={(v) => setConfig({ upscaleMegapixels: v })} />
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Cuántas imágenes hace cada creación (1–4) se elige en los ajustes de la barra; se generan una tras otra. Ampliar hace una sola imagen: sutil redibuja desde sigma 0.53, creativo desde 0.75.
        </p>
      </div>

      <div className="card">
        <h2>Tus workflows</h2>
        <p className="hint">
          En ComfyUI abre tu workflow y usa <strong>Workflow → Export (API)</strong>. Pégalo en la acción que quieras. Puedes marcar dónde va cada dato escribiendo marcadores como valor de un campo; si no pones ninguno, se rellenan solos el prompt, la semilla, el tamaño y la imagen de entrada de los nodos habituales (KSampler, CLIPTextEncode, EmptyLatentImage, LoadImage). Si tu workflow tiene varios LoadImage, pon «estilo» en el título del de la referencia de estilo y «final» en el del fotograma final. Para «Describir», usa un nodo que muestre el texto (ShowText, PreviewAny…).
        </p>
        <ul className="ph-list">
          {PLACEHOLDERS.map((p) => (
            <li key={p.key}>
              <code>{`{{${p.key}}}`}</code> {p.desc}
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 8 }}>
          {ACTION_ORDER.map((a) => (
            <WorkflowSlot key={a} action={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
