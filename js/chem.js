/**
 * chem.js — derivations from an element's ground-state configuration.
 *
 * Everything the diagrams draw is computed from the stored `cfg` string so the
 * Lewis dots, orbital boxes, shell rings and written notation can never
 * disagree with each other.
 */

import { BY_SYMBOL } from './elements.js';

const L_INDEX = { s: 0, p: 1, d: 2, f: 3 };
const NOBLE_CORES = ['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn'];
const SUPERSCRIPT = { 0:'⁰', 1:'¹', 2:'²', 3:'³', 4:'⁴', 5:'⁵', 6:'⁶', 7:'⁷', 8:'⁸', 9:'⁹' };

export function superscript(n) {
  return String(n).split('').map((d) => SUPERSCRIPT[d] ?? d).join('');
}

/** Electrons a subshell can hold: 2(2l+1). */
export const capacityOf = (l) => 2 * (2 * L_INDEX[l] + 1);

/** Number of orbitals in a subshell: 2l+1. */
export const orbitalCountOf = (l) => 2 * L_INDEX[l] + 1;

/** Expand `[Ar] 3d6 4s2` into `1s2 2s2 2p6 3s2 3p6 3d6 4s2`. */
export function expandConfig(cfg) {
  const m = cfg.match(/^\[([A-Z][a-z]?)\]\s*(.*)$/);
  if (!m) return cfg.trim();
  const core = BY_SYMBOL[m[1]];
  if (!core) throw new Error(`Unknown noble-gas core: ${m[1]}`);
  return [expandConfig(core.cfg), m[2].trim()].filter(Boolean).join(' ');
}

/** Parse a configuration string into `{ n, l, count }` subshells. */
export function parseConfig(cfg) {
  return expandConfig(cfg)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const m = token.match(/^(\d+)([spdf])(\d+)$/);
      if (!m) throw new Error(`Unparsable subshell: ${token}`);
      return { n: Number(m[1]), l: m[2], count: Number(m[3]) };
    });
}

/**
 * Sort subshells into filling (Madelung / aufbau) order: ascending n+l, then
 * ascending n. This is the order orbital diagrams are conventionally drawn in,
 * so 4s appears before 3d even though 3d is written first in shorthand.
 */
export function energyOrder(subshells) {
  return [...subshells].sort((a, b) => {
    const sa = a.n + L_INDEX[a.l];
    const sb = b.n + L_INDEX[b.l];
    return sa !== sb ? sa - sb : a.n - b.n;
  });
}

/** Sort subshells by shell then subshell — the order used in written notation. */
export function shellOrder(subshells) {
  return [...subshells].sort((a, b) => (a.n !== b.n ? a.n - b.n : L_INDEX[a.l] - L_INDEX[b.l]));
}

/** Electrons per principal shell, K outwards: [2, 8, 18, ...]. */
export function shellCounts(el) {
  const counts = [];
  for (const { n, count } of parseConfig(el.cfg)) {
    counts[n - 1] = (counts[n - 1] || 0) + count;
  }
  return counts.map((c) => c || 0);
}

/**
 * Valence electrons.
 *
 * For main-group elements this is the s+p population of the outermost shell —
 * the count Lewis structures are built from. For d- and f-block elements a
 * Lewis structure is not conventional; we report the outer-shell s (and p)
 * electrons for drawing and flag the element so the UI can say so, while
 * `extended` additionally counts the incomplete (n-1)d / (n-2)f electrons that
 * take part in bonding.
 */
export function valence(el) {
  const subshells = parseConfig(el.cfg);
  // The valence shell is the element's period, not simply the largest n present:
  // palladium ([Kr] 4d10) has no 5s electrons, so its outermost *occupied* shell
  // is the krypton core's n=4, which is not its valence shell.
  const vShell = el.per;
  const outer = subshells.filter((s) => s.n === vShell && (s.l === 's' || s.l === 'p'));
  const count = outer.reduce((sum, s) => sum + s.count, 0);

  // d- and f-block elements also bond with the underlying (n-1)d set, and the
  // f-block with (n-2)f as well. A filled 4f in platinum is core, not valence,
  // so only f-block elements count their f shell here.
  const inner = subshells.filter(
    (s) =>
      (el.blk === 'd' || el.blk === 'f') && s.l === 'd' && s.n === vShell - 1 ||
      el.blk === 'f' && s.l === 'f' && s.n === vShell - 2,
  );
  const extended = count + inner.reduce((sum, s) => sum + s.count, 0);

  return {
    count,
    extended,
    shell: vShell,
    mainGroup: el.blk === 's' || el.blk === 'p',
    subshells: outer,
    innerSubshells: inner,
  };
}

/**
 * Lewis electron-dot placement.
 *
 * Electrons are added one per side (top, right, bottom, left) before any side
 * is paired, which is the usual classroom convention. Sides carrying two
 * electrons are drawn as a lone pair.
 */
export function lewisDots(el, { useExtended = false } = {}) {
  const v = valence(el);
  const total = Math.min(useExtended ? v.extended : v.count, 8);
  const sides = [0, 0, 0, 0]; // top, right, bottom, left
  if (el.z === 2) {
    sides[0] = 2; // helium is conventionally drawn as a single lone pair
  } else {
    for (let i = 0; i < total; i++) sides[i % 4]++;
  }
  return {
    sides: { top: sides[0], right: sides[1], bottom: sides[2], left: sides[3] },
    total,
    truncated: (useExtended ? v.extended : v.count) > 8,
    conventional: v.mainGroup,
  };
}

/**
 * Orbital box diagram rows.
 *
 * Each subshell becomes `2l+1` boxes filled by Hund's rule: every orbital gets
 * a spin-up electron before any orbital is paired.
 */
export function orbitalRows(el, { scope = 'full' } = {}) {
  const shorthandCore = el.cfg.match(/^\[([A-Z][a-z]?)\]/)?.[1] ?? null;
  const source = scope === 'valence' && shorthandCore
    ? parseConfig(el.cfg.replace(/^\[[A-Z][a-z]?\]\s*/, '') || '')
    : parseConfig(el.cfg);

  const rows = energyOrder(source).map(({ n, l, count }) => {
    const boxes = new Array(orbitalCountOf(l)).fill(0);
    for (let i = 0; i < count; i++) boxes[i % boxes.length]++;
    return { n, l, count, label: `${n}${l}`, boxes };
  });
  return { rows, core: scope === 'valence' ? shorthandCore : null };
}

/** Configuration in aufbau order with unicode superscripts. */
export function notationFull(el) {
  return energyOrder(parseConfig(el.cfg))
    .map((s) => `${s.n}${s.l}${superscript(s.count)}`)
    .join(' ');
}

/** Noble-gas shorthand, e.g. `[Ar] 3d⁶ 4s²`. */
export function notationShorthand(el) {
  const m = el.cfg.match(/^\[([A-Z][a-z]?)\]\s*(.*)$/);
  if (!m) return notationFull(el);
  const rest = shellOrder(parseConfig(m[2] || ''))
    .map((s) => `${s.n}${s.l}${superscript(s.count)}`)
    .join(' ');
  return `[${m[1]}] ${rest}`.trim();
}

/** Configuration as written in the table, shell by shell, e.g. `1s² 2s² 2p⁶`. */
export function notationExpanded(el) {
  return shellOrder(parseConfig(el.cfg))
    .map((s) => `${s.n}${s.l}${superscript(s.count)}`)
    .join(' ');
}

/** Shell populations as `2, 8, 14, 2`. */
export function notationShells(el) {
  return shellCounts(el).join(', ');
}

/** The next noble gas core that would be used for this element's shorthand. */
export function coreOf(el) {
  return el.cfg.match(/^\[([A-Z][a-z]?)\]/)?.[1] ?? null;
}

export { NOBLE_CORES };
