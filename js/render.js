/**
 * render.js — composes an element card into a standalone SVG document.
 *
 * The same string is what the preview shows and what every export format is
 * built from, so a PNG can never drift from what was on screen.
 *
 * Text is positioned from real glyph metrics (via an injected measurer backed
 * by a canvas) rather than `dominant-baseline`, which keeps the output centered
 * identically in browsers, Illustrator and Inkscape.
 */

import { CATEGORIES } from './elements.js';
import { FIELDS, resolve, elementName, formatMass } from './fields.js';
import * as diagrams from './diagrams.js';
import {
  THEMES, LAYOUTS, accentFor, mix, shade, readableInk, contrastRatio,
} from './theme.js';
import { FONT_BY_ID } from './theme.js';

const esc = diagrams.esc;
const n = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * A responsive secondary-text size: `ratio` of `base`, scaled by the user's
 * text-size control, clamped to a [min,max] range that itself scales with
 * that control — otherwise a fixed clamp would cap out the slider's effect.
 * Never applied to the main symbol, which has its own dedicated
 * `symbolScale` so the two remain independently adjustable.
 */
function scaledSize(base, ratio, min, max, cfg) {
  const scale = cfg.textScale ?? 1;
  return clamp(base * ratio * scale, min * scale, max * scale);
}

/* ------------------------------------------------------------------ text -- */

/** Fallback metrics for environments without a canvas (unit tests, SSR). */
function estimate(str, size) {
  return { width: str.length * size * 0.56, ascent: size * 0.72, descent: size * 0.2 };
}

let sharedCtx = null;
function canvasMeasure(str, size, family, weight) {
  if (sharedCtx === null) {
    sharedCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : false;
  }
  if (!sharedCtx) return estimate(str, size);
  sharedCtx.font = `${weight} ${size}px ${family}`;
  const m = sharedCtx.measureText(str);
  return {
    width: m.width,
    ascent: m.actualBoundingBoxAscent || size * 0.72,
    descent: m.actualBoundingBoxDescent || size * 0.2,
  };
}

/** Largest font size at or below `size` whose rendered width fits `maxW`. */
function fitSize(str, size, maxW, family, weight, floor = 0.45) {
  let s = size;
  while (s > size * floor && canvasMeasure(str, s, family, weight).width > maxW) s -= Math.max(0.5, s * 0.04);
  return s;
}

function truncate(str, size, maxW, family, weight) {
  if (canvasMeasure(str, size, family, weight).width <= maxW) return str;
  let out = str;
  while (out.length > 1 && canvasMeasure(out + '...', size, family, weight).width > maxW) out = out.slice(0, -1);
  return out.trimEnd() + '...';
}

/**
 * Unicode superscript digits live outside the Latin subsets that get embedded
 * into an export, so they would fall back to a system face. Rendering them as
 * raised tspans of ordinary digits keeps exports self-contained — and gives
 * better-looking superscripts than the precomposed glyphs do.
 */
const SUPERS = new Map(Object.entries({
  '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4',
  '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
  '\u207a': '+', '\u207b': '-',
}));

function richText(str, size) {
  const s = String(str);
  if (![...s].some((c) => SUPERS.has(c))) return esc(s);
  const out = [];
  let i = 0;
  let raised = false;
  while (i < s.length) {
    if (SUPERS.has(s[i])) {
      let run = '';
      while (i < s.length && SUPERS.has(s[i])) run += SUPERS.get(s[i++]);
      out.push(`<tspan dy="${n(-0.36 * size)}" font-size="${n(0.62 * size)}">${esc(run)}</tspan>`);
      raised = true;
    } else {
      let run = '';
      while (i < s.length && !SUPERS.has(s[i])) run += s[i++];
      // Returning to the baseline needs an equal and opposite shift.
      out.push(raised ? `<tspan dy="${n(0.36 * size)}" font-size="${n(size)}">${esc(run)}</tspan>` : esc(run));
      raised = false;
    }
  }
  return out.join('');
}

function text(str, x, y, o = {}) {
  const attrs = [
    `x="${n(x)}"`, `y="${n(y)}"`,
    `font-family="${o.family}"`,
    `font-size="${n(o.size)}"`,
    o.weight ? `font-weight="${o.weight}"` : '',
    `fill="${o.fill}"`,
    o.anchor ? `text-anchor="${o.anchor}"` : '',
    o.opacity != null ? `opacity="${o.opacity}"` : '',
    o.spacing ? `letter-spacing="${n(o.spacing)}"` : '',
    o.style ? `font-style="${o.style}"` : '',
  ].filter(Boolean);
  return `<text ${attrs.join(' ')}>${richText(str, o.size)}</text>`;
}

/* -------------------------------------------------------------- palettes -- */

/** Nudge `color` until it reaches `min` contrast against `bg`. */
function ensureContrast(color, bg, min = 3.2) {
  if (contrastRatio(color, bg) >= min) return color;
  const towardsDark = readableInk(bg) !== '#FFFFFF';
  let out = color;
  for (let i = 0; i < 12 && contrastRatio(out, bg) < min; i++) {
    out = shade(out, towardsDark ? -0.08 : 0.08);
  }
  return out;
}

/**
 * Resolve every color the layouts draw with from the element plus settings.
 */
export function paletteFor(el, cfg) {
  const theme = THEMES[cfg.theme];
  const accent = accentFor(el, cfg);
  let bg = theme.bg;
  let ink = theme.ink;
  let muted = theme.muted;
  let rule = theme.rule;

  if (cfg.accentMode === 'solid') {
    bg = accent;
    ink = readableInk(accent);
    muted = mix(ink, bg, 0.34);
    rule = mix(ink, bg, 0.62);
  } else if (cfg.accentMode === 'tint') {
    bg = mix(theme.bg, accent, theme.dark ? 0.2 : 0.13);
    rule = mix(rule, accent, 0.4);
  } else if (cfg.accentMode === 'gradient') {
    bg = mix(theme.bg, accent, theme.dark ? 0.26 : 0.18);
    rule = mix(rule, accent, 0.4);
  }

  // A fixed color paired with a second one is a deliberate two-color brand
  // gradient (e.g. Bad Hal's dark-to-bright green) — draw exactly those two
  // colors rather than washing them through the paper theme's background,
  // which is right for a category-colored card but flattens a chosen pair.
  const customGradient = cfg.accentMode === 'gradient' && cfg.colorBy === 'fixed' && cfg.fixedColor2;
  if (customGradient) {
    bg = mix(cfg.fixedColor, cfg.fixedColor2, 0.5);
    // Recompute ink the way 'solid' mode does: the paper theme's own ink
    // (chosen for a light or dark *paper*) is not necessarily readable
    // against two arbitrary custom colors mixed together.
    ink = readableInk(bg);
    muted = mix(ink, bg, 0.34);
    rule = mix(ink, bg, 0.62);
  }

  const onBg = cfg.accentMode === 'solid' || customGradient ? ink : ensureContrast(accent, bg, 3.2);
  return {
    theme, accent, bg, ink, muted, rule,
    accentInk: onBg,
    // Diagrams read best when their strokes track the accent but stay legible.
    diagramAccent: cfg.accentMode === 'solid' || customGradient ? ink : ensureContrast(accent, bg, 3.0),
    gradFrom: customGradient ? cfg.fixedColor : mix(bg, shade(accent, theme.dark ? 0.12 : -0.12), 0.55),
    gradTo: customGradient ? cfg.fixedColor2 : mix(bg, shade(accent, theme.dark ? -0.2 : 0.25), 0.55),
  };
}

/* ------------------------------------------------------------- utilities -- */

/**
 * Lay a set of blocks out vertically, centered in `region`.
 * Each block is `{ h, draw(y) }`; `draw` receives the block's top edge.
 */
function stack(region, blocks, gap) {
  const items = blocks.filter(Boolean);
  if (!items.length) return '';
  const total = items.reduce((s, b) => s + b.h, 0) + gap * (items.length - 1);
  let y = region.y + (region.h - total) / 2;
  const out = [];
  for (const b of items) {
    out.push(b.draw(y));
    y += b.h + gap;
  }
  return out.join('');
}

/** Fit a generated diagram into a box, returning the placed `<g>` markup. */
function placeDiagram(d, box, { align = 'center', scaleCap = 1.6, extraScale = 1 } = {}) {
  if (!d || box.w <= 0 || box.h <= 0) return { markup: '', w: 0, h: 0 };
  const s = Math.min(box.w / d.w, box.h / d.h, scaleCap) * extraScale;
  const w = d.w * s;
  const h = d.h * s;
  const x = align === 'left' ? box.x : align === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  return { markup: `<g transform="translate(${n(x)},${n(y)}) scale(${n(s)})">${d.body}</g>`, w, h, scale: s };
}

function diagramFor(el, cfg, pal, fonts, targetAspect = 1, overrides = {}) {
  return diagrams.build(cfg.diagram, el, {
    ink: pal.ink,
    accent: pal.diagramAccent,
    // Hairline rules can be near-invisible on dark paper, so diagram strokes
    // are derived from the ink instead, guaranteeing contrast on any theme.
    muted: mix(pal.ink, pal.bg, 0.55),
    font: fonts.body,
    extended: cfg.lewisExtended,
    showLabel: cfg.diagramLabels,
    nucleusInk: readableInk(pal.diagramAccent),
    targetAspect,
    ...overrides,
  });
}

/**
 * Build a diagram sized for `box`, dropping its caption when the diagram will
 * be scaled down far enough that the caption would be unreadable. The probe
 * render is cheap — these are small strings, not DOM.
 */
function fittedDiagram(el, cfg, pal, fonts, box, targetAspect = 1) {
  if (cfg.diagram === 'none') return null;
  const probe = diagramFor(el, cfg, pal, fonts, targetAspect, { showLabel: false });
  if (!cfg.diagramLabels) return probe;
  const scale = Math.min(box.w / probe.w, box.h / probe.h);
  return scale >= 0.62 ? diagramFor(el, cfg, pal, fonts, targetAspect, { showLabel: true }) : probe;
}

function detailLines(el, cfg, { exclude = [] } = {}) {
  const skip = new Set(exclude);
  return (cfg.fields || [])
    .filter((id) => !skip.has(id))
    .map((id) => resolve(id, el, cfg))
    .filter(Boolean);
}

/** Field ids already occupying a corner slot, so details don't repeat them. */
function cornerFieldIds(cfg) {
  return cfg.showCorners
    ? [cfg.cornerTopLeft, cfg.cornerTopRight, cfg.cornerBottomLeft, cfg.cornerBottomRight]
    : [];
}

/* --------------------------------------------------------------- layouts -- */

const LAYOUT_FNS = {};

/** Classic periodic-table cell: corner data around a dominant symbol. */
LAYOUT_FNS.classic = (ctx) => {
  const { el, cfg, pal, fonts, box } = ctx;
  const parts = [];
  const cornerSize = scaledSize(box.w, 0.055, 10, 19, cfg);
  let topReserve = 0;
  let bottomReserve = 0;

  if (cfg.showCorners) {
    // Each row is handled as a pair rather than four independent slots: when
    // only one side of a row has content, it reads far better centered as a
    // single banner (think a category label spanning the bottom) than stuck
    // out at one edge with nothing to balance it.
    const rows = [
      { leftKey: 'cornerTopLeft', rightKey: 'cornerTopRight', top: true },
      { leftKey: 'cornerBottomLeft', rightKey: 'cornerBottomRight', top: false },
    ];
    for (const { leftKey, rightKey, top } of rows) {
      const lf = resolve(cfg[leftKey], el, cfg);
      const rf = resolve(cfg[rightKey], el, cfg);
      const slots = lf && rf
        ? [[leftKey, lf, box.x, 'start', top ? 1.3 : 1, top ? 700 : 400],
           [rightKey, rf, box.x + box.w, 'end', 1, 400]]
        : (lf || rf)
          ? [[lf ? leftKey : rightKey, lf || rf, box.x + box.w / 2, 'middle', top ? 1.3 : 1, top ? 700 : 400]]
          : [];
      for (const [key, f, x, anchor, scale, weight] of slots) {
        const size = cornerSize * scale;
        const m = canvasMeasure(f.value, size, fonts.body, weight);
        const y = top ? box.y + m.ascent : box.y + box.h;
        const maxW = box.w * (anchor === 'middle' ? 0.88 : 0.5);
        const value = truncate(f.value, size, maxW, fonts.body, weight);
        parts.push(text(value, x, y, {
          family: fonts.body, size, weight, anchor,
          fill: key === 'cornerTopLeft' ? pal.accentInk : pal.muted,
        }));
        if (top) topReserve = Math.max(topReserve, m.ascent + m.descent);
        else bottomReserve = Math.max(bottomReserve, m.ascent + m.descent);
      }
    }
  }

  const region = {
    x: box.x,
    y: box.y + topReserve + box.h * 0.02,
    w: box.w,
    h: box.h - topReserve - bottomReserve - box.h * 0.04,
  };

  const details = detailLines(el, cfg, { exclude: ['name', ...cornerFieldIds(cfg)] });
  const name = cfg.showName ? elementName(el, cfg) : null;

  const symbolSize = fitSize(el.sym, box.w * 0.46 * cfg.symbolScale, box.w * 0.92, fonts.display, cfg.symbolWeight);
  const sm = canvasMeasure(el.sym, symbolSize, fonts.display, cfg.symbolWeight);
  const nameSize = scaledSize(box.w, 0.085, 11, 28, cfg);
  const detailSize = scaledSize(box.w, 0.052, 9, 16, cfg);
  const cx = box.x + box.w / 2;

  const diagramH = cfg.diagram === 'none' ? 0 : clamp(region.h * 0.3 * cfg.diagramScale, 0, region.h * 0.46);
  const d = fittedDiagram(el, cfg, pal, fonts, { w: box.w, h: diagramH }, 1.6);

  const blocks = [
    { h: sm.ascent + sm.descent, draw: (y) => text(el.sym, cx, y + sm.ascent, {
        family: fonts.display, size: symbolSize, weight: cfg.symbolWeight, anchor: 'middle',
        fill: pal.ink, spacing: cfg.letterSpacing,
      }) },
    name && { h: nameSize * 1.1, draw: (y) => text(
        truncate(name, nameSize, box.w, fonts.body, 500), cx, y + nameSize * 0.82,
        { family: fonts.body, size: nameSize, weight: 500, anchor: 'middle', fill: pal.ink, opacity: 0.88 },
      ) },
    details.length && { h: details.length * detailSize * 1.45, draw: (y) => details.map((f, i) =>
        text(truncate(f.value, detailSize, box.w, fonts.body, 400), cx, y + detailSize * (1 + i * 1.45),
          { family: fonts.body, size: detailSize, anchor: 'middle', fill: pal.muted })).join('') },
    d && { h: diagramH, draw: (y) => placeDiagram(d, { x: box.x, y, w: box.w, h: diagramH }).markup },
  ];

  parts.push(stack(region, blocks, box.h * 0.035));
  return parts.join('');
};

/** Modern: a rule-led header, left-aligned type, data and diagram side by side. */
LAYOUT_FNS.modern = (ctx) => {
  const { el, cfg, pal, fonts, box } = ctx;
  const parts = [];
  const microSize = scaledSize(box.w, 0.042, 8.5, 14, cfg);
  const cat = CATEGORIES[el.cat].label.toUpperCase();

  const catM = canvasMeasure(cat, microSize, fonts.body, 600);
  parts.push(text(truncate(cat, microSize, box.w * 0.7, fonts.body, 600), box.x, box.y + catM.ascent, {
    family: fonts.body, size: microSize, weight: 600, fill: pal.accentInk, spacing: microSize * 0.14,
  }));
  parts.push(text(String(el.z), box.x + box.w, box.y + catM.ascent, {
    family: fonts.body, size: microSize * 1.25, weight: 700, anchor: 'end', fill: pal.muted,
  }));

  const ruleY = box.y + catM.ascent + microSize * 0.8;
  parts.push(`<rect x="${n(box.x)}" y="${n(ruleY)}" width="${n(box.w)}" height="2" fill="${pal.accentInk}" opacity="0.8"/>`);

  const footY = box.y + box.h;
  const details = detailLines(el, cfg, { exclude: ['name'] });
  const detailSize = scaledSize(box.w, 0.05, 9, 15, cfg);
  const footH = details.length ? details.length * detailSize * 1.5 : 0;

  const region = { x: box.x, y: ruleY + box.h * 0.06, w: box.w, h: footY - footH - (ruleY + box.h * 0.1) };

  const diagramW = cfg.diagram === 'none' ? 0 : region.w * 0.38 * cfg.diagramScale;
  const d = fittedDiagram(el, cfg, pal, fonts, { w: diagramW, h: region.h }, 1);
  const typeW = region.w - (d ? diagramW + region.w * 0.05 : 0);

  const symbolSize = fitSize(el.sym, region.h * 0.62 * cfg.symbolScale, typeW, fonts.display, cfg.symbolWeight);
  const sm = canvasMeasure(el.sym, symbolSize, fonts.display, cfg.symbolWeight);
  const nameSize = scaledSize(box.w, 0.08, 11, 26, cfg);
  const name = cfg.showName ? elementName(el, cfg) : null;

  const typeBlocks = [
    { h: sm.ascent + sm.descent, draw: (y) => text(el.sym, box.x, y + sm.ascent, {
        family: fonts.display, size: symbolSize, weight: cfg.symbolWeight, fill: pal.ink, spacing: cfg.letterSpacing }) },
    name && { h: nameSize * 1.15, draw: (y) => text(truncate(name, nameSize, typeW, fonts.body, 500), box.x, y + nameSize * 0.85,
        { family: fonts.body, size: nameSize, weight: 500, fill: pal.ink, opacity: 0.9 }) },
  ];
  parts.push(stack({ ...region, w: typeW }, typeBlocks, box.h * 0.02));

  if (d) {
    parts.push(placeDiagram(d, { x: box.x + region.w - diagramW, y: region.y, w: diagramW, h: region.h }, { align: 'right' }).markup);
  }

  details.forEach((f, i) => {
    const y = footY - (details.length - 1 - i) * detailSize * 1.5;
    parts.push(text(f.short, box.x, y, { family: fonts.body, size: detailSize * 0.92, weight: 600, fill: pal.accentInk, opacity: 0.85 }));
    parts.push(text(truncate(f.value, detailSize, box.w * 0.68, fonts.body, 400), box.x + box.w, y,
      { family: fonts.body, size: detailSize, anchor: 'end', fill: pal.ink, opacity: 0.85 }));
  });

  return parts.join('');
};

/** Study card: symbol block beside a large diagram, properties beneath. */
LAYOUT_FNS.study = (ctx) => {
  const { el, cfg, pal, fonts, box } = ctx;
  const parts = [];
  const details = detailLines(el, cfg, { exclude: ['name', 'mass'] });
  const rowSize = scaledSize(box.w, 0.046, 8.5, 14, cfg);
  const rowH = rowSize * 1.9;
  const tableH = details.length ? details.length * rowH + rowSize : 0;

  const top = { x: box.x, y: box.y, w: box.w, h: box.h - tableH };
  const leftW = top.w * (cfg.diagram === 'none' ? 1 : 0.46);

  const zSize = scaledSize(box.w, 0.05, 9, 16, cfg);
  parts.push(text(String(el.z), box.x, box.y + zSize, { family: fonts.body, size: zSize, weight: 700, fill: pal.accentInk }));

  const name = cfg.showName ? elementName(el, cfg) : null;
  const symbolSize = fitSize(el.sym, top.h * 0.5 * cfg.symbolScale, leftW * 0.96, fonts.display, cfg.symbolWeight);
  const sm = canvasMeasure(el.sym, symbolSize, fonts.display, cfg.symbolWeight);
  const nameSize = scaledSize(box.w, 0.062, 10, 22, cfg);
  const massSize = scaledSize(box.w, 0.045, 8.5, 14, cfg);

  const leftBlocks = [
    { h: sm.ascent + sm.descent, draw: (y) => text(el.sym, box.x + leftW / 2, y + sm.ascent, {
        family: fonts.display, size: symbolSize, weight: cfg.symbolWeight, anchor: 'middle', fill: pal.ink, spacing: cfg.letterSpacing }) },
    name && { h: nameSize * 1.15, draw: (y) => text(truncate(name, nameSize, leftW, fonts.body, 500), box.x + leftW / 2, y + nameSize * 0.85,
        { family: fonts.body, size: nameSize, weight: 500, anchor: 'middle', fill: pal.ink, opacity: 0.9 }) },
    { h: massSize * 1.2, draw: (y) => text(formatMass(el), box.x + leftW / 2, y + massSize * 0.85,
        { family: fonts.body, size: massSize, anchor: 'middle', fill: pal.muted }) },
  ];
  parts.push(stack({ x: box.x, y: top.y + zSize, w: leftW, h: top.h - zSize }, leftBlocks, box.h * 0.018));

  if (cfg.diagram !== 'none') {
    const dbox = { x: box.x + leftW + top.w * 0.03, y: top.y + zSize * 0.5, w: top.w - leftW - top.w * 0.03, h: top.h - zSize };
    const d = fittedDiagram(el, cfg, pal, fonts, dbox, 0.95);
    parts.push(placeDiagram(d, dbox, { extraScale: cfg.diagramScale }).markup);
  }

  details.forEach((f, i) => {
    const y = box.y + box.h - tableH + rowSize + i * rowH + rowSize;
    parts.push(`<line x1="${n(box.x)}" y1="${n(y - rowSize * 1.35)}" x2="${n(box.x + box.w)}" y2="${n(y - rowSize * 1.35)}" stroke="${pal.rule}" stroke-width="1"/>`);
    parts.push(text(f.label, box.x, y, { family: fonts.body, size: rowSize, weight: 500, fill: pal.muted }));
    parts.push(text(truncate(f.value, rowSize, box.w * 0.6, fonts.body, 600), box.x + box.w, y,
      { family: fonts.body, size: rowSize, weight: 600, anchor: 'end', fill: pal.ink }));
  });

  return parts.join('');
};

/** Poster: the symbol as the field itself, facts layered over it. */
LAYOUT_FNS.poster = (ctx) => {
  const { el, cfg, pal, fonts, box, card, uid } = ctx;
  const parts = [];
  const details = detailLines(el, cfg, { exclude: ['name'] });

  // The ghost symbol is allowed to bleed past the padding but is clipped to the
  // card so it never spills onto the page behind it.
  const ghostSize = fitSize(el.sym, card.h * 0.92 * cfg.symbolScale, card.w * 0.98, fonts.display, cfg.symbolWeight, 0.3);
  const gm = canvasMeasure(el.sym, ghostSize, fonts.display, cfg.symbolWeight);
  const ghost = text(el.sym, card.x + card.w / 2, card.y + card.h / 2 + (gm.ascent - gm.descent) / 2, {
    family: fonts.display, size: ghostSize, weight: cfg.symbolWeight, anchor: 'middle',
    fill: pal.accentInk, opacity: cfg.accentMode === 'solid' ? 0.16 : 0.15, spacing: cfg.letterSpacing,
  });
  parts.push(`<g clip-path="url(#card-${uid})">${ghost}</g>`);

  if (cfg.diagram !== 'none') {
    const side = Math.min(box.w, box.h) * 0.46 * cfg.diagramScale;
    const dbox = { x: box.x + box.w - side, y: box.y + box.h * 0.1, w: side, h: side };
    const d = fittedDiagram(el, cfg, pal, fonts, dbox, 1);
    parts.push(`<g opacity="0.95">${placeDiagram(d, dbox, { align: 'right' }).markup}</g>`);
  }

  const zSize = scaledSize(box.w, 0.075, 12, 30, cfg);
  parts.push(text(String(el.z), box.x, box.y + zSize, { family: fonts.display, size: zSize, weight: 700, fill: pal.accentInk }));
  parts.push(text(CATEGORIES[el.cat].label.toUpperCase(), box.x, box.y + zSize * 1.9, {
    family: fonts.body, size: zSize * 0.4, weight: 600, fill: pal.muted, spacing: zSize * 0.05,
  }));

  const nameSize = fitSize(elementName(el, cfg), box.w * 0.155, box.w, fonts.display, 700);
  const name = cfg.showName ? elementName(el, cfg) : el.sym;
  const detailSize = scaledSize(box.w, 0.048, 9, 15, cfg);
  const detailH = details.length * detailSize * 1.55;
  parts.push(text(name, box.x, box.y + box.h - detailH - detailSize * 0.9, {
    family: fonts.display, size: nameSize, weight: 700, fill: pal.ink, spacing: cfg.letterSpacing,
  }));
  details.forEach((f, i) => {
    const line = truncate(`${f.short} ${f.value}`, detailSize, box.w, fonts.body, 400);
    parts.push(text(line, box.x, box.y + box.h - detailH + (i + 1) * detailSize * 1.55 - detailSize * 0.5, {
      family: fonts.body, size: detailSize, fill: pal.muted,
    }));
  });

  return parts.join('');
};

/** Data sheet: a tight header over a labeled property table. */
LAYOUT_FNS.data = (ctx) => {
  const { el, cfg, pal, fonts, box } = ctx;
  const parts = [];
  const details = detailLines(el, cfg, { exclude: ['name', 'mass'] });

  const headerH = box.h * (cfg.diagram === 'none' ? 0.26 : 0.32);
  const symbolSize = fitSize(el.sym, headerH * 0.78 * cfg.symbolScale, box.w * 0.4, fonts.display, cfg.symbolWeight);
  const sm = canvasMeasure(el.sym, symbolSize, fonts.display, cfg.symbolWeight);
  const symBaseline = box.y + headerH * 0.5 + (sm.ascent - sm.descent) / 2;
  parts.push(text(el.sym, box.x, symBaseline, {
    family: fonts.display, size: symbolSize, weight: cfg.symbolWeight, fill: pal.ink, spacing: cfg.letterSpacing }));

  const symW = canvasMeasure(el.sym, symbolSize, fonts.display, cfg.symbolWeight).width;
  const metaSize = scaledSize(box.w, 0.048, 9, 15, cfg);
  const metaX = box.x + symW + box.w * 0.035;
  parts.push(text(String(el.z), metaX, symBaseline - metaSize * 2.4, { family: fonts.body, size: metaSize, weight: 700, fill: pal.accentInk }));
  if (cfg.showName) {
    parts.push(text(truncate(elementName(el, cfg), metaSize * 1.5, box.w * 0.55, fonts.body, 600), metaX, symBaseline - metaSize * 0.9,
      { family: fonts.body, size: metaSize * 1.5, weight: 600, fill: pal.ink }));
  }
  parts.push(text(formatMass(el), metaX, symBaseline + metaSize * 0.5, { family: fonts.body, size: metaSize, fill: pal.muted }));

  if (cfg.diagram !== 'none') {
    const side = headerH * 0.95 * cfg.diagramScale;
    const dbox = { x: box.x + box.w - side, y: box.y, w: side, h: headerH };
    const d = fittedDiagram(el, cfg, pal, fonts, dbox, 1);
    parts.push(placeDiagram(d, dbox, { align: 'right' }).markup);
  }

  const tableY = box.y + headerH;
  parts.push(`<line x1="${n(box.x)}" y1="${n(tableY)}" x2="${n(box.x + box.w)}" y2="${n(tableY)}" stroke="${pal.accentInk}" stroke-width="2"/>`);

  const avail = box.h - headerH;
  const rowH = details.length ? Math.min(avail / details.length, box.h * 0.1) : 0;
  const rowSize = scaledSize(rowH, 0.42, 7.5, 15, cfg);
  details.forEach((f, i) => {
    const y = tableY + rowH * (i + 1) - rowH * 0.32;
    if (i) parts.push(`<line x1="${n(box.x)}" y1="${n(tableY + rowH * i)}" x2="${n(box.x + box.w)}" y2="${n(tableY + rowH * i)}" stroke="${pal.rule}" stroke-width="0.8"/>`);
    parts.push(text(f.label, box.x, y, { family: fonts.body, size: rowSize, fill: pal.muted }));
    parts.push(text(truncate(f.value, rowSize, box.w * 0.55, fonts.body, 600), box.x + box.w, y,
      { family: fonts.body, size: rowSize, weight: 600, anchor: 'end', fill: pal.ink }));
  });

  return parts.join('');
};

/** Diagram first: the diagram is the subject, the symbol is the caption. */
LAYOUT_FNS.diagram = (ctx) => {
  const { el, cfg, pal, fonts, box } = ctx;
  const parts = [];
  const details = detailLines(el, cfg, { exclude: ['name'] });
  const capSize = scaledSize(box.w, 0.07, 11, 26, cfg);
  const subSize = scaledSize(box.w, 0.046, 8.5, 14, cfg);
  const captionH = capSize * 1.2 + (details.length ? subSize * 1.5 : 0);

  if (cfg.diagram !== 'none') {
    const dbox = { x: box.x, y: box.y, w: box.w, h: box.h - captionH - box.h * 0.04 };
    const d = fittedDiagram(el, cfg, pal, fonts, dbox, box.w / Math.max(1, box.h - captionH));
    parts.push(placeDiagram(d, dbox, { extraScale: cfg.diagramScale, scaleCap: 2.4 }).markup);
  } else {
    const symbolSize = fitSize(el.sym, (box.h - captionH) * 0.8, box.w * 0.9, fonts.display, cfg.symbolWeight);
    const sm = canvasMeasure(el.sym, symbolSize, fonts.display, cfg.symbolWeight);
    parts.push(text(el.sym, box.x + box.w / 2, box.y + (box.h - captionH) / 2 + (sm.ascent - sm.descent) / 2, {
      family: fonts.display, size: symbolSize, weight: cfg.symbolWeight, anchor: 'middle', fill: pal.ink }));
  }

  const cx = box.x + box.w / 2;
  const capY = box.y + box.h - (details.length ? subSize * 1.5 : 0);
  const caption = cfg.showName ? `${el.sym} · ${elementName(el, cfg)}` : `${el.sym} · ${el.z}`;
  parts.push(text(truncate(caption, capSize, box.w, fonts.display, 600), cx, capY, {
    family: fonts.display, size: capSize, weight: 600, anchor: 'middle', fill: pal.ink, spacing: cfg.letterSpacing }));
  if (details.length) {
    parts.push(text(truncate(details.map((f) => f.value).join('  ·  '), subSize, box.w, fonts.body, 400), cx, box.y + box.h + subSize * 0.3, {
      family: fonts.body, size: subSize, anchor: 'middle', fill: pal.muted }));
  }
  return parts.join('');
};

/* ------------------------------------------------------------ background -- */

function background(cfg, pal, card, uid) {
  const defs = [];
  const parts = [];
  const r = Math.min(cfg.radius, Math.min(card.w, card.h) / 2);
  defs.push(
    `<clipPath id="card-${uid}"><rect x="${n(card.x)}" y="${n(card.y)}" width="${n(card.w)}" height="${n(card.h)}" rx="${n(r)}"/></clipPath>`,
  );
  const rect = (fill, extra = '') =>
    `<rect x="${n(card.x)}" y="${n(card.y)}" width="${n(card.w)}" height="${n(card.h)}" rx="${n(r)}" fill="${fill}" ${extra}/>`;

  if (cfg.shadow) {
    defs.push(
      `<filter id="sh-${uid}" x="-20%" y="-20%" width="140%" height="140%">` +
      `<feDropShadow dx="0" dy="${n(card.h * 0.016)}" stdDeviation="${n(card.h * 0.018)}" flood-color="#0b1220" flood-opacity="0.22"/></filter>`,
    );
    parts.push(`<g filter="url(#sh-${uid})">${rect(pal.bg)}</g>`);
  }

  if (cfg.accentMode === 'gradient') {
    defs.push(
      `<linearGradient id="g-${uid}" x1="0" y1="0" x2="0.6" y2="1">` +
      `<stop offset="0%" stop-color="${pal.gradFrom}"/><stop offset="100%" stop-color="${pal.gradTo}"/></linearGradient>`,
    );
    parts.push(rect(`url(#g-${uid})`));
  } else {
    parts.push(rect(pal.bg));
  }

  if (pal.theme.grid) {
    const step = Math.max(14, card.w / 18);
    const lines = [];
    for (let x = card.x + step; x < card.x + card.w; x += step) lines.push(`M ${n(x)} ${n(card.y)} V ${n(card.y + card.h)}`);
    for (let y = card.y + step; y < card.y + card.h; y += step) lines.push(`M ${n(card.x)} ${n(y)} H ${n(card.x + card.w)}`);
    parts.push(`<g clip-path="url(#card-${uid})"><path d="${lines.join(' ')}" stroke="${pal.ink}" stroke-width="0.6" opacity="0.12" fill="none"/></g>`);
  }

  if (cfg.accentMode === 'band') {
    const bandH = Math.max(6, card.h * 0.035);
    parts.push(`<g clip-path="url(#card-${uid})"><rect x="${n(card.x)}" y="${n(card.y)}" width="${n(card.w)}" height="${n(bandH)}" fill="${pal.accent}"/></g>`);
  }

  if (cfg.borderWidth > 0 && cfg.borderStyle !== 'none') {
    const bw = cfg.borderWidth;
    if (cfg.borderStyle === 'double') {
      // A thin line near the edge, a gap of the card's own background, then
      // a thicker inner line — the "picture frame" look of a badge tile.
      // Always ink-colored: on a solid-fill card that's already the readable
      // white/black the background picked, so it reads as intended without
      // the user first having to notice a separate "ink" border option.
      const outerW = Math.max(1.5, bw * 0.3);
      const gap = Math.max(4, Math.min(card.w, card.h) * 0.022);
      const inset1 = outerW / 2;
      const inset2 = outerW + gap + bw / 2;
      const ring = (inset, width) =>
        `<rect x="${n(card.x + inset)}" y="${n(card.y + inset)}" width="${n(card.w - inset * 2)}" height="${n(card.h - inset * 2)}" ` +
        `rx="${n(Math.max(0, r - inset))}" fill="none" stroke="${pal.ink}" stroke-width="${n(width)}"/>`;
      parts.push(ring(inset1, outerW) + ring(inset2, bw));
    } else {
      const stroke = cfg.borderStyle === 'accent' ? pal.accent : cfg.borderStyle === 'ink' ? pal.ink : pal.rule;
      parts.push(
        `<rect x="${n(card.x + bw / 2)}" y="${n(card.y + bw / 2)}" width="${n(card.w - bw)}" height="${n(card.h - bw)}" ` +
        `rx="${n(Math.max(0, r - bw / 2))}" fill="none" stroke="${stroke}" stroke-width="${n(bw)}"/>`,
      );
    }
  }

  return { defs: defs.join(''), parts: parts.join('') };
}

/* ------------------------------------------------------------------ main -- */

let uidCounter = 0;

/** Render the card content without the enclosing `<svg>` element. */
export function renderCardBody(el, cfg, { originX = 0, originY = 0, uid } = {}) {
  const id = uid ?? `c${++uidCounter}`;
  const pal = paletteFor(el, cfg);
  const fonts = {
    display: FONT_BY_ID[cfg.displayFont]?.stack ?? FONT_BY_ID.system.stack,
    body: FONT_BY_ID[cfg.bodyFont]?.stack ?? FONT_BY_ID.system.stack,
  };

  const inset = cfg.shadow ? Math.max(8, cfg.height * 0.025) : 0;
  const card = { x: originX + inset, y: originY + inset, w: cfg.width - 2 * inset, h: cfg.height - 2 * inset };
  const pad = clamp(cfg.padding, 0, Math.min(card.w, card.h) / 2.5);
  const box = { x: card.x + pad, y: card.y + pad, w: card.w - 2 * pad, h: card.h - 2 * pad };

  const bg = background(cfg, pal, card, id);
  const layout = LAYOUT_FNS[cfg.layout] ?? LAYOUT_FNS.classic;
  const content = layout({ el, cfg, pal, fonts, box, card, uid: id });

  return { defs: bg.defs, body: bg.parts + content, pal };
}

/** Render a complete, standalone SVG document for one element. */
export function renderCard(el, cfg) {
  const { defs, body } = renderCardBody(el, cfg);
  const title = `${elementName(el, cfg)} (${el.sym}), element ${el.z}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${cfg.width}" height="${cfg.height}" viewBox="0 0 ${cfg.width} ${cfg.height}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title>` +
    (defs ? `<defs>${defs}</defs>` : '') +
    body +
    `</svg>`
  );
}

/**
 * Render several elements as one contact sheet, reusing the card renderer so a
 * sheet cell is pixel-identical to the single card.
 */
export function renderSheet(elements, cfg, { columns = 6, gap = 16, background: sheetBg = null } = {}) {
  const cols = Math.max(1, Math.min(columns, elements.length));
  const rows = Math.ceil(elements.length / cols);
  const w = cols * cfg.width + (cols - 1) * gap;
  const h = rows * cfg.height + (rows - 1) * gap;
  const defs = [];
  const bodies = [];

  elements.forEach((el, i) => {
    const cx = (i % cols) * (cfg.width + gap);
    const cy = Math.floor(i / cols) * (cfg.height + gap);
    const r = renderCardBody(el, cfg, { originX: cx, originY: cy, uid: `s${i}` });
    if (r.defs) defs.push(r.defs);
    bodies.push(r.body);
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    (sheetBg ? `<rect width="${n(w)}" height="${n(h)}" fill="${sheetBg}"/>` : '') +
    bodies.join('') +
    `</svg>`
  );
}

export { LAYOUTS };
