// Procedural placeholder artwork (SVG). Used for the Explore gallery and for
// demo mode, so the site works before a ComfyUI server is connected.

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const PALETTES = [
  ['#0f1c3f', '#2b4c8c', '#f2a65a', '#f7d6a0', '#e2574c'],
  ['#1b1b2f', '#e43f5a', '#162447', '#1f4068', '#f4e9cd'],
  ['#0b3d2e', '#2f7d5d', '#a7c957', '#f2e8cf', '#bc4749'],
  ['#2d1e2f', '#8e4162', '#f2b880', '#ffd6ba', '#5c6f68'],
  ['#08121f', '#13315c', '#8da9c4', '#eef4ed', '#f6ae2d'],
  ['#3d0c11', '#b2442b', '#f0a868', '#fbe7c6', '#1d3557'],
  ['#101820', '#5f4b8b', '#e69a8d', '#fdd9b5', '#42b4a6'],
  ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'],
  ['#14213d', '#fca311', '#e5e5e5', '#ffffff', '#3a86ff'],
  ['#1a1423', '#3d1e6d', '#8f2d56', '#d81159', '#ffbc42'],
];

export interface ArtOptions {
  /** Same key → same palette and composition family (a "prompt"). */
  key: number;
  /** Variation layers inside the family: each {seed, jitter} nudges the composition (jitter 1 = big change). */
  layers: { seed: number; jitter: number }[];
  w: number;
  h: number;
  /** Extra empty margin painted around the composition (zoom out / pan). */
  frame?: { l: number; r: number; t: number; b: number };
  /** Animate it (demo video). */
  motion?: 'low' | 'high';
}

export function artSvg({ key, layers, w, h, frame, motion }: ArtOptions): string {
  const base = rng(key);
  const vs = layers.map((l) => ({ r: rng(l.seed ^ 0x9e3779b9), k: l.jitter }));
  const j = (v: number, amount: number) => vs.reduce((acc, l) => acc + (l.r() - 0.5) * amount * l.k, v);
  const seed = layers.reduce((a, l) => a ^ l.seed, 0) >>> 0;
  const pal = PALETTES[key % PALETTES.length];
  const kind = key % 4;
  const W = 1000;
  const H = Math.round((1000 * h) / w);

  const blobs: string[] = [];
  const n = 5 + Math.floor(base() * 4);
  for (let i = 0; i < n; i++) {
    const cx = j(base() * W, W * 0.5);
    const cy = j(base() * H, H * 0.5);
    const r = j((0.15 + base() * 0.35) * Math.max(W, H), 200);
    const c = pal[1 + Math.floor(base() * 4)];
    const o = (0.45 + base() * 0.5).toFixed(2);
    blobs.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${Math.abs(r).toFixed(0)}" fill="${c}" opacity="${o}"/>`);
  }

  let fg = '';
  if (kind === 0) {
    // horizon + sun
    const hy = j(H * (0.55 + base() * 0.2), H * 0.15);
    const sx = j(W * (0.3 + base() * 0.4), W * 0.3);
    fg = `<circle cx="${sx.toFixed(0)}" cy="${(hy - H * 0.12).toFixed(0)}" r="${(W * 0.11).toFixed(0)}" fill="${pal[3]}" opacity="0.9"/>
      <path d="M0 ${hy.toFixed(0)} Q ${W * 0.3} ${(hy - j(80, 120)).toFixed(0)} ${W * 0.55} ${(hy + 20).toFixed(0)} T ${W} ${(hy - 40).toFixed(0)} V ${H} H 0 Z" fill="${pal[0]}" opacity="0.85"/>`;
  } else if (kind === 1) {
    // layered mountains
    for (let l = 0; l < 3; l++) {
      const y = H * (0.5 + l * 0.15);
      const pts = Array.from({ length: 7 }, (_, k) => `${((W / 6) * k).toFixed(0)},${j(y - base() * 160, 140).toFixed(0)}`).join(' ');
      fg += `<polygon points="0,${H} ${pts} ${W},${H}" fill="${pal[l === 2 ? 0 : 1 + l]}" opacity="${0.55 + l * 0.2}"/>`;
    }
  } else if (kind === 2) {
    // portrait-like silhouette
    const cx = j(W * 0.5, W * 0.2);
    fg = `<ellipse cx="${cx.toFixed(0)}" cy="${(H * 0.42).toFixed(0)}" rx="${W * 0.16}" ry="${H * 0.2}" fill="${pal[0]}" opacity="0.8"/>
      <path d="M ${cx - W * 0.36} ${H} Q ${cx} ${H * 0.52} ${cx + W * 0.36} ${H} Z" fill="${pal[0]}" opacity="0.85"/>`;
  } else {
    // geometric rings
    const cx = j(W * 0.5, W * 0.3), cy = j(H * 0.5, H * 0.3);
    for (let r = 1; r <= 5; r++) fg += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(r * W * 0.08).toFixed(0)}" fill="none" stroke="${pal[r % 5]}" stroke-width="${(8 + r * 3).toFixed(0)}" opacity="0.7"/>`;
  }

  const id = `g${(key ^ seed).toString(36)}`;
  let inner = `<defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="${j(0.3, 0.6).toFixed(2)}" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>
    <filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(70 + base() * 50).toFixed(0)}"/></filter>
    <filter id="${id}s"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="${id}n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 1000}"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.09 0"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}b)"/>
  <g filter="url(#${id}f)">${blobs.join('')}</g>
  <g filter="url(#${id}s)">${fg}</g>
  <rect width="${W}" height="${H}" filter="url(#${id}n)"/>`;

  let vw = W, vh = H, vx = 0, vy = 0;
  if (frame) {
    vx = -frame.l * W;
    vy = -frame.t * H;
    vw = W * (1 + frame.l + frame.r);
    vh = H * (1 + frame.t + frame.b);
    inner = `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${pal[0]}"/>
      <g filter="url(#${id}f)" opacity="0.8"><circle cx="${vx + vw * 0.2}" cy="${vy + vh * 0.8}" r="${vw * 0.3}" fill="${pal[1]}"/><circle cx="${vx + vw * 0.85}" cy="${vy + vh * 0.2}" r="${vw * 0.3}" fill="${pal[2]}"/></g>
      ${inner}`;
  }
  if (motion) inner = animate(inner, motion, seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
}

/** Demo video of any picture (e.g. an uploaded start frame): slow camera move over it. */
export function animatedPictureUrl(dataUrl: string, w: number, h: number, motion: 'low' | 'high', seed: number): string {
  const W = 1000, H = Math.round((1000 * h) / w);
  const inner = `<g filter="url(#pf)"><image href="${dataUrl}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/></g><g filter="url(#ps)"></g><rect width="${W}" height="${H}" filter="url(#pn)" opacity="0"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${animate(inner, motion, seed)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Small JPEG copy (for moodboards, so they survive a reload without filling storage). */
export async function thumbDataUrl(url: string, w: number, h: number, max = 384): Promise<{ url: string; w: number; h: number }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', 0.8), w, h };
}

export async function toDataUrl(url: string, w: number, h: number): Promise<string> {
  const blob = await toPngBlob(url, Math.min(w, 1024), Math.round((Math.min(w, 1024) * h) / w));
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** Demo "video": a looping camera move with parallax, drawn with CSS animation inside the SVG. */
function animate(inner: string, motion: 'low' | 'high', seed: number): string {
  const r = rng(seed ^ 0x51ed);
  const sx = r() > 0.5 ? 1 : -1;
  const sy = r() > 0.5 ? 1 : -1;
  const hi = motion === 'high';
  const zoom = hi ? 1.28 : 1.07;
  const cam = `scale(${zoom}) translate(${(sx * (hi ? 4 : 1)).toFixed(1)}%, ${(sy * (hi ? 3 : 1)).toFixed(1)}%)`;
  const blob = `translate(${(sx * (hi ? 9 : 2.5)).toFixed(1)}%, ${(-sy * (hi ? 7 : 2)).toFixed(1)}%)`;
  const fore = `translate(${(-sx * (hi ? 6 : 1.5)).toFixed(1)}%, ${(sy * (hi ? 2.5 : 0.6)).toFixed(1)}%)${hi ? ' rotate(2deg)' : ''}`;
  const d = hi ? [4, 2.6, 3.2] : [9, 6, 7];
  const css = `.c,.b,.f{transform-box:view-box;transform-origin:50% 50%;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
    .c{animation-name:c;animation-duration:${d[0]}s}.b{animation-name:b;animation-duration:${d[1]}s}.f{animation-name:f;animation-duration:${d[2]}s}
    @keyframes c{to{transform:${cam}}}@keyframes b{to{transform:${blob}}}@keyframes f{to{transform:${fore}}}`;
  const parts = inner
    .replace(/<g filter="url\(#(\w+)f\)">/, '<g class="b"><g filter="url(#$1f)">')
    .replace(/<g filter="url\(#(\w+)s\)">/, '</g><g class="f"><g filter="url(#$1s)">')
    .replace(/(<rect width="\d+" height="\d+" filter="url\(#\w+n\)"\/>)/, '</g>$1');
  return `<style>${css}</style><g class="c">${parts}</g>`;
}

export function artUrl(o: ArtOptions): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artSvg(o))}`;
}

/** Turns any image URL (including SVG data URLs) into a PNG blob for uploading to ComfyUI. */
export async function toPngBlob(url: string, w: number, h: number): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo convertir la imagen'))), 'image/png'));
}
