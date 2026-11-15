import { createRoot } from 'react-dom/client';
import { loadSaved } from './saved';
import './styles.css';
import './features.css';
import './workspace.css';
import './modes.css';

const theme = localStorage.getItem('lumen.theme');
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

const root = createRoot(document.getElementById('root')!);
// The stores read their saved files when their modules load, so the app is imported after them.
loadSaved(['state', 'config', 'stylepreviews', 'searches'])
  .then(() => import('./App'))
  .then(({ App }) => root.render(<App />))
  .catch((e: Error) => root.render(<p style={{ padding: 24 }}>{e.message}</p>));
