/**
 * export.js — turning a rendered card into a downloadable file.
 *
 * Rasterizing an SVG through an <img> deliberately does not fetch external
 * resources, web fonts included. So before any PNG/WebP is produced the web
 * fonts in use are fetched, base64-encoded and inlined as @font-face rules.
 * Without this step every export would silently fall back to a system font.
 */

import { FONT_BY_ID } from './theme.js';
import { encodeLosslessWebp, webpEncoderSupported } from './webpEncoder.js';

const cssCache = new Map();
const fileCache = new Map();

/** Google's latin and latin-ext blocks cover every glyph the cards can emit. */
const WANTED_SUBSETS = ['U+0000-00FF', 'U+0100-02AF', 'U+0102-0103'];

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Load the stylesheet Google serves for these families, as CSS text. */
async function fetchFontCss(families) {
  const key = families.join('|');
  if (cssCache.has(key)) return cssCache.get(key);
  const url = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font stylesheet request failed (${res.status})`);
  const css = await res.text();
  cssCache.set(key, css);
  return css;
}

/**
 * Build self-contained @font-face rules for the given fonts.
 * Returns '' for system-only selections, and throws if the network is
 * unavailable so callers can decide whether to continue without embedding.
 */
export async function buildFontCss(fontIds) {
  const fonts = [...new Set(fontIds)].map((id) => FONT_BY_ID[id]).filter((f) => f?.google);
  if (!fonts.length) return '';

  const css = await fetchFontCss(fonts.map((f) => f.google));
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  const keep = blocks.filter((b) => {
    const range = b.match(/unicode-range:\s*([^;]+);/)?.[1];
    return !range || WANTED_SUBSETS.some((s) => range.includes(s));
  });

  const out = [];
  for (const block of keep) {
    const src = block.match(/src:\s*url\((https:\/\/[^)]+)\)/)?.[1];
    if (!src) continue;
    if (!fileCache.has(src)) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Font file request failed (${res.status})`);
      const mime = src.endsWith('.woff2') ? 'font/woff2' : src.endsWith('.woff') ? 'font/woff' : 'font/ttf';
      fileCache.set(src, `data:${mime};base64,${bufferToBase64(await res.arrayBuffer())}`);
    }
    out.push(block.replace(src, fileCache.get(src)));
  }
  return out.join('\n');
}

/** Insert a `<style>` block carrying embedded fonts into an SVG document. */
export function withEmbeddedFonts(svg, fontCss) {
  if (!fontCss) return svg;
  const style = `<style type="text/css"><![CDATA[\n${fontCss}\n]]></style>`;
  return svg.includes('<defs>')
    ? svg.replace('<defs>', `<defs>${style}`)
    : svg.replace(/(<svg[^>]*>)/, `$1<defs>${style}</defs>`);
}

/** The font ids a config actually uses. */
export function fontsUsedBy(cfg) {
  return [cfg.displayFont, cfg.bodyFont];
}

function svgBlobUrl(svg) {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
}

/** Draw an SVG string onto a canvas at `scale` times its intrinsic size. */
export async function rasterize(svg, { scale = 2, width, height, background = null } = {}) {
  const url = svgBlobUrl(svg);
  try {
    const img = new Image();
    img.decoding = 'sync';
    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The card could not be rasterized.'));
    });
    img.src = url;
    await loaded;
    if (img.decode) await img.decode().catch(() => {});

    const w = Math.max(1, Math.round((width ?? img.naturalWidth) * scale));
    const h = Math.max(1, Math.round((height ?? img.naturalHeight) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`${type} is not supported by this browser.`))), type, quality);
  });
}

/**
 * Produce a downloadable blob.
 *
 * WebP does not go through the browser's own encoder: `canvas.toBlob(...,
 * 'image/webp', 1)` is genuinely lossless (it writes a VP8L chunk and the
 * pixels round-trip exactly) but compresses so poorly that the result is
 * routinely 100x larger than necessary — often bigger than the PNG it's
 * supposedly a smaller alternative to. There's no way to raise the effort
 * through the Canvas API, so the app carries its own WebP encoder instead
 * (see webpEncoder.js) and only falls back to the browser's encoder on the
 * rare browser with no WebAssembly.
 */
export async function toBlob(svg, format, opts = {}) {
  if (format === 'svg') return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const canvas = await rasterize(svg, opts);
  if (format === 'png') return canvasToBlob(canvas, 'image/png');
  if (format === 'webp') {
    if (webpEncoderSupported()) {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bytes = await encodeLosslessWebp(imageData);
      return new Blob([bytes], { type: 'image/webp' });
    }
    // No WebAssembly (essentially unreachable in a modern browser): fall
    // back to the browser's own encoder rather than fail outright.
    const blob = await canvasToBlob(canvas, 'image/webp', 1);
    if (blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP.');
    return blob;
  }
  throw new Error(`Unknown format: ${format}`);
}

/**
 * Walk the RIFF chunk list of a WebP file and report whether the pixel data is
 * stored in a VP8L (lossless) chunk rather than VP8 (lossy).
 *
 * The app's own encoder always asks for lossless, so this should always be
 * true; it exists as a check on that, and on the rare no-WebAssembly
 * fallback to the browser's own encoder, whose losslessness at quality 1.0
 * is real but an implementation detail rather than a guarantee.
 */
export async function isLosslessWebp(blob) {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const tag = (bytes, at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (header.length < 12 || tag(header, 0) !== 'RIFF' || tag(header, 8) !== 'WEBP') return false;

  let offset = 12;
  while (offset + 8 <= blob.size) {
    const head = new Uint8Array(await blob.slice(offset, offset + 8).arrayBuffer());
    if (head.length < 8) break;
    const id = tag(head, 0);
    if (id === 'VP8L') return true;
    if (id === 'VP8 ') return false;
    const size = head[4] | (head[5] << 8) | (head[6] << 16) | (head[7] << 24);
    if (size < 0) break;
    offset += 8 + size + (size & 1);
  }
  return false;
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Copy a PNG of the card to the clipboard, where the browser allows it. */
export async function copyPng(svg, opts) {
  if (!navigator.clipboard?.write) throw new Error('Clipboard images are not supported here.');
  const blob = await toBlob(svg, 'png', opts);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Load the web fonts the page needs for the live preview. */
export function ensurePreviewFonts(fontIds) {
  const families = [...new Set(fontIds)].map((id) => FONT_BY_ID[id]).filter((f) => f?.google);
  if (!families.length) return Promise.resolve();
  const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f.google}`).join('&')}&display=swap`;
  if (!document.querySelector(`link[href="${CSS.escape ? href : href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  return document.fonts ? document.fonts.ready : Promise.resolve();
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a download filename. `styleLabel` names the design in the filename —
 * pass the active preset's name when one is selected, since "poster" (the
 * layout id) says far less about a card than "neon-lab" does. Falls back to
 * the layout id when no preset is active.
 */
export function filenameFor(el, cfg, format, styleLabel) {
  const style = slugify(styleLabel || cfg.layout);
  const bits = [String(el.z).padStart(3, '0'), el.sym.toLowerCase(), style];
  return `${bits.join('-')}.${format}`;
}
