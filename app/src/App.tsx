import { useState } from 'react';
import { IconBoard, IconCreate, IconEdit, IconExplore, IconMoon, IconMore, IconNodes, IconOrganize, IconPalette, IconSparkle, IconSun, Logo } from './icons';
import { navigate, routeHref, useRoute, type Route } from './router';
import { ImagineBar } from './components/ImagineBar';
import { Lightbox } from './components/Lightbox';
import { Explore } from './pages/Explore';
import { Create } from './pages/Create';
import { Organize } from './pages/Organize';
import { ComfySettings } from './pages/ComfySettings';
import { Editor } from './pages/Editor';
import { Docs } from './pages/Docs';
import { Moodboards } from './pages/Moodboards';
import { Personalize } from './pages/Personalize';
import { StyleCreator } from './pages/StyleCreator';
import { ContextMenu } from './components/ContextMenu';
import { useStore } from './store';
import { LANGS, lang, setLang, t, type Lang } from './i18n';

const NAV: { route: Route; label: string; Icon: typeof IconExplore; phone: boolean }[] = [
  { route: 'explore', label: t('Explorar'), Icon: IconExplore, phone: true },
  { route: 'imagine', label: t('Crear'), Icon: IconCreate, phone: true },
  { route: 'edit', label: t('Editar'), Icon: IconEdit, phone: true },
  { route: 'personalize', label: t('Personalizar'), Icon: IconSparkle, phone: false },
  { route: 'moodboards', label: t('Moodboards'), Icon: IconBoard, phone: false },
  { route: 'style-creator', label: t('Crear estilos'), Icon: IconPalette, phone: false },
  { route: 'organize', label: t('Organizar'), Icon: IconOrganize, phone: true },
  { route: 'comfyui', label: 'ComfyUI', Icon: IconNodes, phone: false },
];

/** Phone tab bar: the pages that don't fit go in a "Más" menu. */
function MoreMenu({ current }: { current: Route }) {
  const [open, setOpen] = useState(false);
  const extra = NAV.filter((n) => !n.phone);
  const active = extra.some((n) => n.route === current);
  return (
    <div className="nav-more">
      <button className={`nav-item${active ? ' active' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <IconMore size={22} />
        <span>{t('Más')}</span>
      </button>
      {open && (
        <div className="menu up right" role="menu">
          {extra.map((n) => (
            <button
              key={n.route}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(n.route);
              }}
            >
              <n.Icon size={16} /> {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const IconHelp = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6V14" />
    <circle cx="12" cy="17" r=".6" fill="currentColor" />
  </svg>
);

function NavLink({ route, label, Icon, current, phone = true }: { route: Route; label: string; Icon: typeof IconExplore; current: Route; phone?: boolean }) {
  return (
    <a
      href={routeHref(route)}
      className={`nav-item${current === route ? ' active' : ''}${phone ? '' : ' desk-only'}`}
      aria-current={current === route ? 'page' : undefined}
      title={label}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        navigate(route);
      }}
    >
      <Icon size={22} />
      <span>{label}</span>
    </a>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lumen.theme', next);
    setDark(!dark);
  };
  return (
    <button className="nav-item" onClick={toggle} title={dark ? t('Modo claro') : t('Modo oscuro')}>
      {dark ? <IconSun size={22} /> : <IconMoon size={22} />}
      <span>{dark ? t('Modo claro') : t('Modo oscuro')}</span>
    </button>
  );
}

function LangPicker() {
  return (
    <label className="nav-item lang-pick" title={t('Idioma')}>
      <span aria-hidden="true">文A</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('Idioma')}>
        {Object.entries(LANGS).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const route = useRoute();
  const running = useStore((s) => s.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={t('Principal')}>
        <a className="brand" href={routeHref('explore')} onClick={(e) => (e.preventDefault(), navigate('explore'))}>
          <Logo />
          <span>Lumen</span>
        </a>
        <div className="nav">
          {NAV.map((n) => (
            <NavLink key={n.route} {...n} current={route} />
          ))}
          <MoreMenu current={route} />
        </div>
        <div className="nav-bottom">
          <NavLink route="docs" label={t('Ayuda')} Icon={IconHelp} current={route} />
          <ThemeToggle />
          <LangPicker />
          <div className="conn">
            <span className="dot on" />
            <span>ComfyUI{running ? t(' · {running} en curso', { running }) : ''}</span>
          </div>
        </div>
      </nav>

      <main className="main">
        <div className="topbar">
          <a className="brand" href={routeHref('explore')} onClick={(e) => (e.preventDefault(), navigate('explore'))}>
            <Logo size={24} />
            <span>Lumen</span>
          </a>
          <span className="row">
            <a className="nav-item" href={routeHref('docs')} aria-label={t('Ayuda')} title={t('Ayuda')} onClick={(e) => (e.preventDefault(), navigate('docs'))}>
              <IconHelp size={22} />
              <span>{t('Ayuda')}</span>
            </a>
            <ThemeToggle />
            <LangPicker />
          </span>
        </div>
        {route === 'explore' && (
          <header className="hero">
            <h1>{t('Imagina cualquier cosa')}</h1>
            <h2>{t('Crea imágenes y vídeos con tu propio ComfyUI')}</h2>
            <p>{t('Escribe una idea en la barra de abajo y pulsa Enter. Se crea con MiniMax H3 Image; añade --anima o --moss para Anima o MOSS Image.')}</p>
          </header>
        )}
        {(route === 'explore' || route === 'imagine' || route === 'organize') && <ImagineBar />}
        {route === 'explore' && <Explore />}
        {route === 'imagine' && <Create />}
        {route === 'organize' && <Organize />}
        {route === 'edit' && <Editor />}
        {route === 'personalize' && <Personalize />}
        {route === 'moodboards' && <Moodboards />}
        {route === 'style-creator' && <StyleCreator />}
        {route === 'comfyui' && <ComfySettings />}
        {route === 'docs' && <Docs />}
        <footer className="foot">
          {t('Lumen · los botones de generación envían tu workflow a ComfyUI ·')}{' '}
          <a href={routeHref('comfyui')} onClick={(e) => (e.preventDefault(), navigate('comfyui'))}>
            {t('Ajustes de ComfyUI')}
          </a>
        </footer>
      </main>
      <Lightbox />
      <ContextMenu />
      <Toasts />
    </div>
  );
}
