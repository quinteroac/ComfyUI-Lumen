import { useState } from 'react';
import { IconClose, IconFolder, IconMore } from '../icons';
import {
  addToFolder,
  createFolder,
  createFolderGroup,
  deleteFolder,
  deleteFolderGroup,
  downloadFolder,
  moveFolderToGroup,
  openFolder,
  renameFolder,
  renameFolderGroup,
  toast,
  useStore,
} from '../store';
import type { Folder } from '../comfy/types';
import { t } from '../i18n';

/** Drag format for images dragged onto folders. */
export const DRAG_TYPE = 'application/x-lumen-images';
export type DragItems = { jobId: string; index: number }[];

export function readDragItems(dt: DataTransfer): DragItems | null {
  try {
    const raw = dt.getData(DRAG_TYPE);
    return raw ? (JSON.parse(raw) as DragItems) : null;
  } catch {
    return null;
  }
}

function FolderRow({ f, count, onOpen }: { f: Folder; count: number; onOpen: () => void }) {
  const groups = useStore((s) => s.folderGroups);
  const current = useStore((s) => s.currentFolder);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [over, setOver] = useState(false);
  if (renaming)
    return (
      <form
        className="menu-form"
        onSubmit={(e) => {
          e.preventDefault();
          renameFolder(f.id, (e.currentTarget.elements.namedItem('n') as HTMLInputElement).value);
          setRenaming(false);
        }}
      >
        <input name="n" defaultValue={f.name} autoFocus aria-label={t('Nombre de la carpeta')} onBlur={() => setRenaming(false)} />
      </form>
    );
  return (
    <div
      className={`menu-row${current === f.id ? ' on' : ''}${over ? ' drop' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const items = readDragItems(e.dataTransfer);
        if (items?.length) {
          addToFolder(items, f.id);
          toast(`${items.length} ${items.length === 1 ? t('imagen añadida') : t('imágenes añadidas')} a «${f.name}»`);
        }
      }}
    >
      <button role="menuitem" onClick={onOpen} title={t('Abrir: lo que crees se guardará aquí')}>
        <IconFolder size={14} /> {f.name} <span className="count">{count}</span>
      </button>
      <div className="menu-wrap">
        <button className="icon-btn tiny" aria-label={t('Opciones de {name}', { name: f.name })} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <IconMore size={14} />
        </button>
        {menu && (
          <div className="menu sub" role="menu">
            <button role="menuitem" onClick={() => (setMenu(false), setRenaming(true))}>
              {t('Renombrar')}
            </button>
            <button role="menuitem" onClick={() => (setMenu(false), downloadFolder(f.id))}>
              {t('Descargar')}
            </button>
            {groups.length > 0 && <span className="menu-label">{t('Mover a')}</span>}
            {groups
              .filter((g) => g.id !== f.groupId)
              .map((g) => (
                <button key={g.id} role="menuitem" onClick={() => (setMenu(false), moveFolderToGroup(f.id, g.id))}>
                  ↳ {g.name}
                </button>
              ))}
            {f.groupId && (
              <button role="menuitem" onClick={() => (setMenu(false), moveFolderToGroup(f.id, undefined))}>
                {t('↳ Fuera del grupo')}
              </button>
            )}
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                setMenu(false);
                if (confirm(t('¿Borrar la carpeta «{name}»? Las imágenes no se borran.', { name: f.name }))) deleteFolder(f.id);
              }}
            >
              {t('Borrar')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Folder button + menu: open a folder (creation and filtering happen inside it), groups, rename, download, delete, drop images. */
export function FolderButton({ counts }: { counts: Record<string, number> }) {
  const folders = useStore((s) => s.folders);
  const groups = useStore((s) => s.folderGroups);
  const current = useStore((s) => s.currentFolder);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'folder' | 'group'>('folder');
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const cur = folders.find((f) => f.id === current);
  const ungrouped = folders.filter((f) => !f.groupId || !groups.some((g) => g.id === f.groupId));
  const row = (f: Folder) => (
    <FolderRow
      key={f.id}
      f={f}
      count={counts[f.id] ?? 0}
      onOpen={() => {
        openFolder(f.id);
        setOpen(false);
      }}
    />
  );
  return (
    <div className="menu-wrap">
      <span className={`folder-btn${cur ? ' on' : ''}`}>
        <button className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
          <IconFolder size={15} /> {cur ? cur.name : t('Carpetas')}
        </button>
        {cur && (
          <button className="icon-btn tiny" aria-label={t('Salir de la carpeta')} onClick={() => openFolder(undefined)}>
            <IconClose size={13} />
          </button>
        )}
      </span>
      {open && (
        <div className="menu wide" role="menu">
          {folders.length === 0 && <p className="hint">{t('Aún no tienes carpetas.')}</p>}
          {folders.length > 0 && <p className="hint">{t('Arrastra imágenes a una carpeta para añadirlas.')}</p>}
          {ungrouped.map(row)}
          {groups.map((g) => (
            <div key={g.id} className="menu-group">
              {renamingGroup === g.id ? (
                <form
                  className="menu-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renameFolderGroup(g.id, (e.currentTarget.elements.namedItem('n') as HTMLInputElement).value);
                    setRenamingGroup(null);
                  }}
                >
                  <input name="n" defaultValue={g.name} autoFocus aria-label={t('Nombre del grupo')} onBlur={() => setRenamingGroup(null)} />
                </form>
              ) : (
                <div className="menu-label group">
                  <span onDoubleClick={() => setRenamingGroup(g.id)} title={t('Doble clic para renombrar')}>
                    {g.name}
                  </span>
                  <button className="chip-x" aria-label={t('Deshacer el grupo {name}', { name: g.name })} title={t('Deshacer el grupo (las carpetas se quedan)')} onClick={() => deleteFolderGroup(g.id)}>
                    <IconClose size={11} />
                  </button>
                </div>
              )}
              {folders.filter((f) => f.groupId === g.id).map(row)}
              {!folders.some((f) => f.groupId === g.id) && <p className="hint">{t('Mueve carpetas aquí con su menú ⋯')}</p>}
            </div>
          ))}
          <form
            className="menu-form"
            onSubmit={(e) => {
              e.preventDefault();
              const ok = mode === 'folder' ? createFolder(name) : createFolderGroup(name);
              if (ok) setName('');
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'folder' ? t('Nueva carpeta + Enter') : t('Nuevo grupo + Enter')} aria-label={mode === 'folder' ? t('Nueva carpeta') : t('Nuevo grupo de carpetas')} />
          </form>
          <div className="row" style={{ padding: '4px 4px 0', gap: 6 }}>
            <button className={`btn small${mode === 'folder' ? ' primary' : ''}`} onClick={() => setMode('folder')}>
              {t('Nueva carpeta')}
            </button>
            <button className={`btn small${mode === 'group' ? ' primary' : ''}`} onClick={() => setMode('group')}>
              {t('Nuevo grupo')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
