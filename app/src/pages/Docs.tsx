import { useEffect, useMemo, useState } from 'react';
import { ARTICLES, CATEGORIES, articleOf, type Article } from '../docs';
import { Markdown, headingId } from '../docs/markdown';
import { navigateDoc, useDocSlug } from '../router';
import '../docs/docs.css';

/** Articles whose title, summary or text has every word of the query, titles first. */
function search(query: string): Article[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  return [...ARTICLES.filter((a) => has(a.title)), ...ARTICLES.filter((a) => !has(a.title) && has(`${a.summary} ${a.body}`))];
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input className="doc-search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search the docs" aria-label="Search the docs" />;
}

function Results({ query }: { query: string }) {
  const found = search(query);
  if (!found.length) return <p className="hint">No articles match “{query}”.</p>;
  return (
    <ul className="doc-results">
      {found.map((a) => (
        <li key={a.slug}>
          <a href={`/lumen/docs/${a.slug}`} onClick={(e) => (e.preventDefault(), navigateDoc(a.slug))}>
            {a.title}
          </a>
          <span className="doc-crumb">{a.category.title}</span>
          <p>{a.summary}</p>
        </li>
      ))}
    </ul>
  );
}

function Home() {
  const [query, setQuery] = useState('');
  return (
    <div className="page docs-home">
      <header className="doc-hero">
        <h1>Lumen Docs</h1>
        <p>Everything Lumen can do, from your first prompt to video, styles and your own workflows.</p>
        <SearchBox value={query} onChange={setQuery} />
      </header>
      {query.trim() ? (
        <Results query={query} />
      ) : (
        <div className="doc-cards">
          {CATEGORIES.map((c) => (
            <section key={c.id} className="doc-card">
              <h2>{c.title}</h2>
              <p className="hint">{c.description}</p>
              <ul>
                {c.articles.map((a) => (
                  <li key={a.slug}>
                    <a href={`/lumen/docs/${a.slug}`} onClick={(e) => (e.preventDefault(), navigateDoc(a.slug))}>
                      {a.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticlePage({ article }: { article: Article }) {
  const [query, setQuery] = useState('');
  const index = ARTICLES.indexOf(article);
  const prev = ARTICLES[index - 1];
  const next = ARTICLES[index + 1];
  const related = article.category.articles.filter((a) => a !== article).slice(0, 5);
  const toc = useMemo(() => article.body.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3)), [article]);
  const link = (a: Article, label?: string) => (
    <a href={`/lumen/docs/${a.slug}`} onClick={(e) => (e.preventDefault(), navigateDoc(a.slug))}>
      {label ?? a.title}
    </a>
  );

  useEffect(() => setQuery(''), [article]);

  return (
    <div className="docs">
      <nav className="doc-nav" aria-label="Documentation">
        <SearchBox value={query} onChange={setQuery} />
        {CATEGORIES.map((c) => (
          <div key={c.id}>
            <h4>{c.title}</h4>
            <ul>
              {c.articles.map((a) => (
                <li key={a.slug} className={a === article ? 'on' : ''}>
                  {link(a)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <article className="doc-article">
        <p className="doc-crumb">
          <a href="/lumen/docs" onClick={(e) => (e.preventDefault(), navigateDoc())}>
            Docs
          </a>{' '}
          › {article.category.title}
        </p>
        {query.trim() ? (
          <Results query={query} />
        ) : (
          <>
            <h1>{article.title}</h1>
            <Markdown text={article.body} onLink={navigateDoc} />
            <div className="doc-pager">
              {prev ? link(prev, `‹ ${prev.title}`) : <span />}
              {next ? link(next, `${next.title} ›`) : <span />}
            </div>
            {related.length > 0 && (
              <section className="doc-related">
                <h2>Related articles</h2>
                <ul>
                  {related.map((a) => (
                    <li key={a.slug}>{link(a)}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </article>
      {toc.length > 1 && !query.trim() && (
        <aside className="doc-toc" aria-label="On this page">
          <h4>On this page</h4>
          <ul>
            {toc.map((h) => (
              <li key={h}>
                <a href={`#${headingId(h)}`} onClick={(e) => (e.preventDefault(), document.getElementById(headingId(h))?.scrollIntoView({ behavior: 'smooth' }))}>
                  {h}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

/** The documentation, in English: a home with every category, and one page per article. */
export function Docs() {
  const slug = useDocSlug();
  const article = slug ? articleOf(slug) : undefined;
  return article ? <ArticlePage article={article} /> : <Home />;
}
