import { useMemo, useState } from 'react';
import { ACTION_LABELS, isVideoAction, type Job } from '../comfy/types';
import { IconCopy, IconHeart, IconRerun, IconSearch, IconTrash, IconVideo } from '../icons';
import { openLightbox, type LbItem } from '../lightbox';
import { addRef, cancelJob, imageToRef, inFolder, rerunJob, runAction, setDraft, setTrashed, toggleLike, trashJob, useStore } from '../store';
import { Media, VideoBadge } from '../components/Media';
import { FolderButton } from '../components/Folders';
import { imageHandlers } from '../components/ContextMenu';
import { openStyleCreator } from './StyleCreator';
import { t } from '../i18n';

export function jobItems(job: Job): LbItem[] {
  return job.images
    .map((img, index) => ({ img, prompt: job.prompt, jobId: job.id, index, meta: jobMeta(job) }))
    .filter((it) => !it.img.trashed);
}

export function jobMeta(job: Job) {
  const m: string[] = [];
  if (job.action === 'upscale_video') m.push('×2 RelayVSR');
  else if (isVideoAction(job.action)) {
    m.push(`--motion ${job.inputs.motion ?? 'low'}`, `${job.inputs.frames ?? ''} fotogramas`);
    if (job.inputs.loop) m.push('--loop');
    if (job.settings.videoResolution === 'hd') m.push('HD');
  } else {
    m.push(`--ar ${job.settings.aspect}`);
    if (job.settings.chaos) m.push(`--c ${job.settings.chaos}`);
    if (job.inputs.hd) m.push('HD');
    if (job.inputs.draft) m.push('borrador');
    if (job.inputs.tile) m.push('--tile');
    if (job.inputs.sref) m.push(`--sref ${job.inputs.sref}`);
  }
  m.push(`seed ${job.inputs.seed}`);
  return m;
}

const REF_LABEL = { image: 'imagen', style: 'estilo', character: 'personaje', start: 'inicio', end: 'final' };

function Tile({ job, i }: { job: Job; i: number }) {
  const img = job.images[i];
  const items = jobItems(job);
  const open = () => openLightbox(items, Math.max(0, items.findIndex((it) => it.index === i)));
  const source = { jobId: job.id, index: i };
  const video = img.kind === 'video';
  return (
    <div className="job-img" style={{ aspectRatio: `${img.w} / ${img.h}` }} {...imageHandlers(() => [source])}>
      <button className="tile-open" onClick={open} aria-label={`Abrir ${video ? t('vídeo') : 'imagen'} ${i + 1}`}>
        <Media img={img} alt={`${job.prompt} (${i + 1})`} />
      </button>
      {video && <VideoBadge />}
      <div className="hover-bar">
        <button className={`icon-btn${img.liked ? ' on' : ''}`} aria-label={t('Me gusta')} title={t('Me gusta')} onClick={() => toggleLike(job.id, i)}>
          <IconHeart size={16} filled={img.liked} />
        </button>
        {video ? (
          job.action !== 'upscale_video' && (
            <button className="pill" data-action="extend" title={t('Alargar vídeo (auto)')} onClick={() => runAction('extend', { source, prompt: job.rawPrompt, motion: job.inputs.motion })}>
              {t('Alargar')}
            </button>
          )
        ) : (
          <>
            {job.inputs.draft && (
              <button className="pill" data-action="vary_subtle" title={t('Mejorar: regenerar este borrador a resolución completa')} onClick={() => runAction('vary_subtle', { source })}>
                {t('Mejorar')}
              </button>
            )}
            <button className="pill" data-action="vary_subtle" title={t('Variar (sutil)')} onClick={() => runAction('vary_subtle', { source })}>
              {t('V·sutil')}
            </button>
            <button className="pill" data-action="vary_strong" title={t('Variar (fuerte)')} onClick={() => runAction('vary_strong', { source })}>
              {t('V·fuerte')}
            </button>
            <button className="icon-btn" data-action="animate" aria-label={t('Animar')} title={t('Animar (movimiento bajo)')} onClick={() => runAction('animate', { source, prompt: job.prompt, motion: 'low' })}>
              <IconVideo size={16} />
            </button>
          </>
        )}
        <button className="icon-btn" aria-label={t('Papelera')} title={t('Mover a la papelera')} onClick={() => setTrashed([source], true)}>
          <IconTrash size={16} />
        </button>
      </div>
    </div>
  );
}

function DescribeResult({ job }: { job: Job }) {
  const texts = job.texts ?? [];
  return (
    <div className="describe">
      {texts.map((prompt, n) => (
        <div key={n} className="describe-item">
          <span className="describe-n">{n + 1}</span>
          <p>{prompt}</p>
          <div className="row">
            <button className="btn small" onClick={() => setDraft(prompt)}>
              {t('Usar prompt')}
            </button>
            <button className="btn small" data-action="imagine" onClick={() => runAction('imagine', { prompt })}>
              {t('Imaginar')}
            </button>
          </div>
        </div>
      ))}
      {texts.length > 1 && (
        <button className="btn small primary" data-action="imagine" onClick={() => texts.forEach((prompt) => runAction('imagine', { prompt }))}>
          {t('Ejecutar los {texts}', { texts: texts.length })}
        </button>
      )}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const busy = job.status === 'queued' || job.status === 'running';
  const visible = job.images.map((im, i) => ({ im, i })).filter(({ im }) => !im.trashed);
  const n = job.status === 'done' ? visible.length : job.action === 'describe' ? 1 : job.inputs.batch;
  const video = isVideoAction(job.action);
  const cls = n === 1 ? ' single' : video || n === 2 ? ' two' : job.inputs.draft && n > 4 ? ' draft' : '';
  const ratio = `${job.inputs.width} / ${job.inputs.height}`;
  return (
    <article className="job" aria-busy={busy}>
      {job.action === 'describe' && job.status === 'done' ? (
        <DescribeResult job={job} />
      ) : (
        <div className={`job-grid${cls}`}>
          {visible.map(({ i }) => (
            <Tile key={i} job={job} i={i} />
          ))}
          {job.status !== 'done' &&
            Array.from({ length: Math.max(0, n - job.images.length) }, (_, i) => <div key={`p${i}`} className={`placeholder${busy ? '' : ' error'}`} style={{ aspectRatio: ratio }} />)}
        </div>
      )}
      <div className="job-side">
        <p className="job-prompt">{job.rawPrompt || job.prompt}</p>
        {job.styleList && <p className="hint job-styles">{t('Estilos:')} {job.styleList.split('\n').join(' · ')}</p>}
        {!!job.refs?.length && (
          <div className="job-refs">
            {job.refs.map((r, k) => (
              <span className="ref-thumb" key={k} title={REF_LABEL[r.kind]}>
                <img src={r.url} alt={REF_LABEL[r.kind]} />
                <span>{REF_LABEL[r.kind]}</span>
              </span>
            ))}
          </div>
        )}
        <div className="job-meta">
          {job.action !== 'imagine' && <span className="chip">{ACTION_LABELS[job.action]}</span>}
          {jobMeta(job).map((m) => (
            <span className="chip" key={m}>
              {m}
            </span>
          ))}
          {job.inputs.engine !== 'h3' && <span className="chip">{job.inputs.engine === 'anima' ? 'Anima' : 'MOSS Image'}</span>}
        </div>
        {busy && (
          <>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
              <div style={{ width: `${Math.max(3, job.progress * 100)}%` }} />
            </div>
            <div className="status">{job.message ?? (job.status === 'queued' ? t('En cola…') : t('Generando…'))}</div>
          </>
        )}
        {(job.status === 'error' || job.status === 'cancelled') && <div className={`status${job.status === 'error' ? ' error' : ''}`}>{job.message}</div>}
        <div className="job-actions">
          {busy ? (
            <button className="btn small" onClick={() => cancelJob(job.id)}>
              {t('Cancelar')}
            </button>
          ) : (
            <>
              {job.action !== 'edit' && (
                <button className="btn small" data-action={job.action} title={t('Volver a generar con una semilla nueva')} onClick={() => rerunJob(job)}>
                  <IconRerun size={15} /> {t('Repetir')}
                </button>
              )}
              <button
                className="btn small"
                title={t('Poner el prompt y las imágenes en la barra')}
                onClick={() => {
                  setDraft(job.rawPrompt);
                  const r = job.rerun?.refs;
                  r?.images?.forEach((x) => addRef('images', x));
                  r?.style?.forEach((x) => addRef('style', x));
                  r?.character?.forEach((x) => addRef('character', x));
                  if (r?.start) addRef('start', r.start);
                  if (job.action === 'animate' && !r?.start && job.rerun?.image) addRef('start', imageToRef(job.rerun.image));
                }}
              >
                <IconCopy size={15} /> {t('Usar')}
              </button>
              {!video && job.action !== 'describe' && (
                <button className="btn small" title={t('Abrir este prompt en el Creador de estilos')} onClick={() => openStyleCreator(job.rawPrompt)}>
                  {t('Creador de estilos')}
                </button>
              )}
              {job.inputs.moodboard && <span className="chip">--p {job.inputs.moodboard}</span>}
              {!video && job.action !== 'describe' && job.action !== 'edit' && !job.inputs.hd && job.status === 'done' && (
                <button className="btn small" title={t('Repetir en alta resolución')} onClick={() => rerunJob(job, '--hd')}>
                  HD
                </button>
              )}
              <button className="btn small" aria-label={t('Mover a la papelera')} title={t('Mover a la papelera')} onClick={() => trashJob(job.id)}>
                <IconTrash size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function Create() {
  const jobs = useStore((s) => s.jobs);
  const folderId = useStore((s) => s.currentFolder);
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const j of jobs) for (const im of j.images) if (!im.trashed) for (const f of new Set([...(im.folderIds ?? []), ...(j.folderId ? [j.folderId] : [])])) c[f] = (c[f] ?? 0) + 1;
    return c;
  }, [jobs]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter((j) => {
      const live = j.status !== 'done' || j.texts?.length || j.images.some((im) => !im.trashed);
      if (!live) return false;
      if (folderId && !(j.folderId === folderId || j.images.some((im) => inFolder(j, im, folderId)))) return false;
      if (needle && !j.rawPrompt.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [jobs, folderId, q]);

  return (
    <section aria-label={t('Crear')}>
      <div className="toolbar feed-toolbar">
        <FolderButton counts={counts} />
        <label className="search">
          <IconSearch size={16} />
          <input type="search" placeholder={t('Buscar en tus prompts')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Buscar en tus prompts')} />
        </label>
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <h2>{folderId ? t('Esta carpeta está vacía') : q ? t('Sin resultados') : t('Empieza a imaginar')}</h2>
          <p>
            {folderId
              ? t('Lo que crees ahora se guardará en esta carpeta.')
              : t('Escribe una idea arriba y pulsa Enter. Cada trabajo crea las imágenes que elijas en los ajustes de la barra (1–4), que puedes variar, ampliar, remezclar, editar o animar en vídeo.')}
          </p>
        </div>
      ) : (
        <div className="feed">
          {list.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </div>
      )}
    </section>
  );
}
