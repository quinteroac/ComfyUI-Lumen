import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { toast } from '../store';

interface ModelRow {
  id: string;
  group: string;
  kind: string;
  name: string;
  size: number;
  url: string;
  page?: string;
  installed: boolean;
  status?: { state: 'queued' | 'downloading' | 'error'; done: number; error?: string };
}

const gb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);
/** The repository or model page a file comes from. */
const source = (m: ModelRow) => m.page ?? m.url.split('/resolve/')[0];

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) toast((await res.json().catch(() => ({}))).error ?? t('ComfyUI respondió {status}{1}', { status: res.status, '1': '' }), 'error');
}

/** Lumen's default models: which are installed, and downloads on request (downloads.py). */
export function ModelDownloads() {
  const [data, setData] = useState<{ roots: string[]; models: ModelRow[] }>();
  const [root, setRoot] = useState('');
  const busy = !!data?.models.some((m) => m.status && m.status.state !== 'error');

  const refresh = () =>
    fetch('/lumen/models')
      .then((r) => r.json())
      .then(setData, () => undefined);

  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [busy]);

  if (!data) return null;
  const target = root || data.roots[0];
  const missing = data.models.filter((m) => !m.installed && !m.status);
  const download = async (ids: string[]) => {
    for (const id of ids) await post('/lumen/models/download', { id, root: target });
    void refresh();
  };
  const groups = [...new Set(data.models.map((m) => m.group))];

  return (
    <div className="card">
      <h2>{t('Modelos')}</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        {t('Los modelos que usa Lumen por defecto. Solo se descargan cuando pulsas Descargar, de Hugging Face o Civitai, uno tras otro, y cada archivo se comprueba antes de guardarlo. Cada modelo tiene su propia licencia: revísala en su página.')}
      </p>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {data.roots.length > 1 && (
          <label className="field">
            {t('Guardar en')}
            <select value={target} onChange={(e) => setRoot(e.target.value)}>
              {data.roots.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
        <button className="btn primary" disabled={!missing.length} onClick={() => void download(missing.map((m) => m.id))}>
          {missing.length ? t('Descargar los que faltan ({size})', { size: gb(missing.reduce((s, m) => s + m.size, 0)) }) : t('Todos instalados')}
        </button>
      </div>
      <div className="doc-table">
        <table>
          <tbody>
            {groups.map((g) => [
              <tr key={g}>
                <th colSpan={4}>{g}</th>
              </tr>,
              ...data.models
                .filter((m) => m.group === g)
                .map((m) => (
                  <tr key={m.id}>
                    <td>
                      <a href={source(m)} target="_blank" rel="noreferrer">
                        {m.name.split('/').pop()}
                      </a>
                      <div className="hint">{`${m.kind}/${m.name}`}</div>
                    </td>
                    <td>{gb(m.size)}</td>
                    <td>
                      {m.installed
                        ? t('Instalado')
                        : m.status?.state === 'downloading'
                          ? `${Math.floor((100 * m.status.done) / m.size)}% · ${gb(m.status.done)}`
                          : m.status?.state === 'queued'
                            ? t('En cola')
                            : m.status?.state === 'error'
                              ? <span className="err">{m.status.error}</span>
                              : t('Falta')}
                    </td>
                    <td>
                      {!m.installed &&
                        (m.status && m.status.state !== 'error' ? (
                          <button className="btn small" onClick={() => void post('/lumen/models/cancel', { id: m.id }).then(refresh)}>
                            {t('Cancelar')}
                          </button>
                        ) : (
                          <button className="btn small" onClick={() => void download([m.id])}>
                            {t('Descargar')}
                          </button>
                        ))}
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
