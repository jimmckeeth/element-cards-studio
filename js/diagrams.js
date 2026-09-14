/**
 * diagrams.js — SVG generators for the electron diagrams.
 *
 * Each generator draws into its own coordinate space and returns
 * `{ body, w, h }`. Layouts place a diagram with a single translate/scale
 * transform, so a diagram never needs to know where on the card it will land.
 */

import * as chem from './chem.js';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const n = (v) => Math.round(v * 100) / 100;

/**
 * Lewis electron-dot structure: the symbol with its valence electrons placed
 * one per side before any side pairs up.
 */
export function lewis(el, opts) {
  const { ink, accent, font, extended = false, showLabel = false } = opts;
  const size = 150;
  const c = size / 2;
  const dots = chem.lewisDots(el, { useExtended: extended });
  const r = 5;
  const gap = 7.5;      // half-separation between the two electrons of a pair
  const dx = 40;        // horizontal stand-off from the symbol's centre
  const dy = 36;        // vertical stand-off

  const circles = [];
  const put = (x, y) => circles.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${accent}"/>`);

  const place = (count, axis, sign) => {
    if (!count) return;
    const offsets = count === 1 ? [0] : [-gap, gap];
    for (const o of offsets) {
      if (axis === 'y') put(c + o, c + sign * dy);
      else put(c + sign * dx, c + o);
    }
  };
  place(dots.sides.top, 'y', -1);
  place(dots.sides.bottom, 'y', 1);
  place(dots.sides.right, 'x', 1);
  place(dots.sides.left, 'x', -1);

  const label = showLabel
    ? `<text x="${c}" y="${size - 2}" text-anchor="middle" font-family="${font}" font-size="12" fill="${ink}" opacity="0.6">${dots.total} valence electrons</text>`
    : '';

  return {
    w: size,
    h: showLabel ? size + 8 : size,
    body: `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-family="${font}" font-size="46" font-weight="600" fill="${ink}">${esc(el.sym)}</text>${circles.join('')}${label}`,
    meta: dots,
  };
}

/**
 * Bohr shell diagram: a nucleus ringed by one circle per principal shell, with
 * that shell's electrons spaced evenly around it.
 */
export function shells(el, opts) {
  const { ink, accent, muted, font, showLabel = true, nucleusLabel = 'symbol' } = opts;
  const counts = chem.shellCounts(el);
  const size = 250;
  const c = size / 2;
  const nucleusR = Math.min(20, 26 - counts.length);
  const outerR = c - 16 - (showLabel ? 10 : 0);
  const step = (outerR - nucleusR - 10) / counts.length;

  const rings = [];
  const electrons = [];
  const labels = [];

  counts.forEach((count, i) => {
    const R = nucleusR + 10 + step * (i + 1);
    rings.push(`<circle cx="${c}" cy="${c}" r="${n(R)}" fill="none" stroke="${muted}" stroke-width="1" opacity="0.55"/>`);
    // Electrons are small enough to stay distinct even in a 32-electron shell.
    const dotR = count > 24 ? 3 : count > 14 ? 3.6 : 4.2;
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / count;
      electrons.push(`<circle cx="${n(c + R * Math.cos(a))}" cy="${n(c + R * Math.sin(a))}" r="${dotR}" fill="${accent}"/>`);
    }
    if (showLabel) {
      labels.push(
        `<text x="${n(c + R + 6)}" y="${c - 3}" font-family="${font}" font-size="11" fill="${ink}" opacity="0.65">${count}</text>`,
      );
    }
  });

  const inner = nucleusLabel === 'z' ? String(el.z) : el.sym;
  const nucleus =
    `<circle cx="${c}" cy="${c}" r="${nucleusR}" fill="${accent}"/>` +
    `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-family="${font}" font-size="${nucleusR * 0.95}" font-weight="700" fill="${opts.nucleusInk || '#ffffff'}">${esc(inner)}</text>`;

  return { w: size, h: size, body: rings.join('') + nucleus + electrons.join(''), meta: { counts } };
}

/** A spin-up or spin-down arrow inside an orbital box. */
function arrow(x, top, height, up, color) {
  const bottom = top + height;
  const head = up
    ? `M ${n(x - 3.4)} ${n(top + 4.8)} L ${n(x)} ${n(top)} L ${n(x + 3.4)} ${n(top + 4.8)}`
    : `M ${n(x - 3.4)} ${n(bottom - 4.8)} L ${n(x)} ${n(bottom)} L ${n(x + 3.4)} ${n(bottom - 4.8)}`;
  return (
    `<path d="M ${n(x)} ${n(top)} L ${n(x)} ${n(bottom)}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" fill="none"/>` +
    `<path d="${head}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
  );
}

/**
 * Orbital box diagram in aufbau order, filled by Hund's rule.
 *
 * Long configurations are flowed into several columns so a heavy element stays
 * roughly square rather than becoming an unusable ribbon.
 */
export function orbitals(el, opts) {
  const { ink, accent, muted, font, scope = 'full', showLabel = true, targetAspect = 1 } = opts;
  const { rows, core } = chem.orbitalRows(el, { scope });

  const BOX = 22;
  const GAP = 3;
  const ROW_H = 34;
  const LABEL_W = 26;
  const COL_GAP = 18;
  const maxBoxes = Math.max(...rows.map((r) => r.boxes.length), 1);
  const colW = LABEL_W + maxBoxes * (BOX + GAP);

  // Choose the column count whose resulting block is closest to the target shape.
  let best = { cols: 1, score: Infinity, perCol: rows.length };
  for (let cols = 1; cols <= Math.min(5, rows.length); cols++) {
    const perCol = Math.ceil(rows.length / cols);
    const w = cols * colW + (cols - 1) * COL_GAP;
    const h = perCol * ROW_H;
    const score = Math.abs(Math.log(w / h) - Math.log(targetAspect));
    if (score < best.score) best = { cols, score, perCol };
  }

  const { cols, perCol } = best;
  const parts = [];
  rows.forEach((row, i) => {
    const col = Math.floor(i / perCol);
    const x0 = col * (colW + COL_GAP);
    const y0 = (i % perCol) * ROW_H;
    if (showLabel) {
      parts.push(
        `<text x="${n(x0)}" y="${n(y0 + BOX / 2)}" dominant-baseline="central" font-family="${font}" font-size="12.5" fill="${ink}" opacity="0.85">${row.label}</text>`,
      );
    }
    row.boxes.forEach((filled, b) => {
      const bx = x0 + (showLabel ? LABEL_W : 0) + b * (BOX + GAP);
      parts.push(
        `<rect x="${n(bx)}" y="${n(y0)}" width="${BOX}" height="${BOX}" rx="2.5" fill="none" stroke="${muted}" stroke-width="1.2"/>`,
      );
      if (filled >= 1) parts.push(arrow(bx + BOX * 0.33, y0 + 4, BOX - 8, true, accent));
      if (filled >= 2) parts.push(arrow(bx + BOX * 0.67, y0 + 4, BOX - 8, false, accent));
    });
  });

  const w = cols * colW + (cols - 1) * COL_GAP - GAP;
  const h = Math.min(perCol, rows.length) * ROW_H - (ROW_H - BOX);
  let body = parts.join('');
  let height = h;

  if (core) {
    body = `<text x="0" y="-8" font-family="${font}" font-size="12.5" fill="${ink}" opacity="0.7">[${core}] core omitted</text>${body}`;
    height = h + 18;
    body = `<g transform="translate(0,18)">${parts.join('')}</g><text x="0" y="10" font-family="${font}" font-size="12.5" fill="${ink}" opacity="0.7">[${core}] core</text>`;
  }

  return { w, h: height, body, meta: { rows: rows.length, cols } };
}

/** Dispatch by diagram id; returns null for `none`. */
export function build(kind, el, opts) {
  switch (kind) {
    case 'lewis': return lewis(el, opts);
    case 'shell': return shells(el, opts);
    case 'orbital': return orbitals(el, { ...opts, scope: 'full' });
    case 'orbitalValence': return orbitals(el, { ...opts, scope: 'valence' });
    default: return null;
  }
}
