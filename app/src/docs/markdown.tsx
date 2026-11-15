// The small Markdown the docs articles are written in: headings, paragraphs, lists, tables, notes, code,
// ```prompt blocks (each line a prompt you can copy or try), and lines of ![caption](file) images or videos.
import { Fragment, type ReactNode } from 'react';
import { setDraft, toast } from '../store';
import { navigate } from '../router';

const MEDIA = '/lumen/docs-media/';

export const headingId = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(text: string, onLink: (slug: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = out.length;
    if (m[1] !== undefined) out.push(<code key={key}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={key}>{inline(m[2], onLink)}</strong>);
    else if (m[4].startsWith('#')) {
      const slug = m[4].slice(1);
      out.push(
        <a key={key} href={`/lumen/docs/${slug}`} onClick={(e) => (e.preventDefault(), onLink(slug))}>
          {inline(m[3], onLink)}
        </a>,
      );
    } else
      out.push(
        <a key={key} href={m[4]} target="_blank" rel="noreferrer">
          {m[3]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function PromptLines({ lines }: { lines: string[] }) {
  return (
    <div className="doc-prompts">
      {lines.map((line, i) => (
        <div key={i} className="doc-prompt">
          <code>{line}</code>
          <span className="doc-prompt-actions">
            <button
              className="pill"
              onClick={() => {
                void navigator.clipboard?.writeText(line);
                toast('Prompt copied');
              }}
            >
              Copy
            </button>
            <button
              className="pill"
              onClick={() => {
                setDraft(line);
                navigate('imagine');
              }}
            >
              Try in Lumen
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function Media({ items }: { items: { caption: string; file: string }[] }) {
  return (
    <div className={`doc-media n${Math.min(items.length, 4)}`}>
      {items.map(({ caption, file }) => (
        <figure key={file + caption}>
          {file.endsWith('.mp4') ? <video src={MEDIA + file} autoPlay muted loop playsInline controls /> : <img src={MEDIA + file} alt={caption} loading="lazy" />}
          <figcaption>{caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ text, onLink }: { text: string; onLink: (slug: string) => void }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  const take = (test: (l: string) => boolean) => {
    const got: string[] = [];
    while (i < lines.length && test(lines[i])) got.push(lines[i++]);
    return got;
  };
  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;
    if (!line.trim()) i++;
    else if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      i++;
      const body = take((l) => !l.startsWith('```'));
      i++;
      blocks.push(lang === 'prompt' ? <PromptLines key={key} lines={body} /> : <pre key={key}><code>{body.join('\n')}</code></pre>);
    } else if (line.startsWith('### ')) {
      blocks.push(<h3 key={key}>{inline(line.slice(4), onLink)}</h3>);
      i++;
    } else if (line.startsWith('## ')) {
      blocks.push(<h2 key={key} id={headingId(line.slice(3))}>{inline(line.slice(3), onLink)}</h2>);
      i++;
    } else if (line.startsWith('|')) {
      const [head, , ...rows] = take((l) => l.startsWith('|'));
      blocks.push(
        <div key={key} className="doc-table">
          <table>
            <thead>
              <tr>{cells(head).map((c, k) => <th key={k}>{inline(c, onLink)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n}>{cells(r).map((c, k) => <td key={k}>{inline(c, onLink)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith('> ')) {
      const body = take((l) => l.startsWith('> ')).map((l) => l.slice(2)).join(' ');
      const kind = /^\*\*Tip:\*\*/.test(body) ? 'tip' : 'note';
      blocks.push(<aside key={key} className={`doc-callout ${kind}`}>{inline(body, onLink)}</aside>);
    } else if (/^!\[/.test(line)) {
      const items = take((l) => /^!\[[^\]]*\]\([^)]+\)$/.test(l)).map((l) => {
        const m = l.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)!;
        return { caption: m[1], file: m[2] };
      });
      blocks.push(<Media key={key} items={items} />);
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = take((l) => (ordered ? /^\d+\. / : /^- /).test(l)).map((l) => l.replace(/^(- |\d+\. )/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={key}>{items.map((it, k) => <li key={k}>{inline(it, onLink)}</li>)}</List>);
    } else {
      const para = take((l) => !!l.trim() && !/^(```|#|\||> |!\[|- |\d+\. )/.test(l));
      // A line no other block takes (e.g. a stray "#") is still shown as text.
      if (!para.length) para.push(lines[i++]);
      blocks.push(<p key={key}>{inline(para.join(' '), onLink)}</p>);
    }
  }
  return <Fragment>{blocks}</Fragment>;
}
