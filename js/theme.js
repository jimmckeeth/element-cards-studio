/**
 * theme.js — the visual vocabulary of a card.
 *
 * A card's look is composed from four independent choices: a palette (which
 * color a category maps to), a paper theme (background and ink), an accent
 * mode (how the category color is applied), and a type pairing. Keeping them
 * orthogonal means a handful of options cover a very wide design space.
 */

const CATEGORY_KEYS = [
  'alkali', 'alkaline', 'transition', 'post', 'metalloid',
  'nonmetal', 'halogen', 'noble', 'lanthanide', 'actinide', 'unknown',
];

const palette = (name, colors) => ({ name, colors: Object.fromEntries(CATEGORY_KEYS.map((k, i) => [k, colors[i]])) });

export const PALETTES = {
  spectrum: palette('Spectrum', [
    '#E24A68', '#EE8434', '#3F7FBF', '#6C7A99', '#2FA98C',
    '#5EA84E', '#D6AE29', '#8E63C4', '#CC5C96', '#B04A73', '#8D97A3',
  ]),
  muted: palette('Muted', [
    '#B26359', '#BC8757', '#5B7B92', '#77807C', '#6B8F81',
    '#849C69', '#B29F58', '#83769A', '#A2708B', '#8F6579', '#95968F',
  ]),
  pastel: palette('Pastel', [
    '#F2A2A8', '#F6C79A', '#A6C6EA', '#BCC2DD', '#A4DCCB',
    '#BCDFA6', '#EDD99B', '#CDB6E6', '#EFB4CE', '#DFAABA', '#CFD4D9',
  ]),
  neon: palette('Neon', [
    '#FF3D71', '#FF8A3D', '#00C2E0', '#5C6CFF', '#00D9A3',
    '#3DDC5E', '#FFD029', '#B94DFF', '#FF5CC0', '#FF6B6B', '#7A8794',
  ]),
  jewel: palette('Jewel', [
    '#8E1F3F', '#A8541B', '#1D4E7A', '#3D4A63', '#136A5C',
    '#3C6B2E', '#9A7712', '#573180', '#8A2A63', '#6B1F47', '#4A5461',
  ]),
  mineral: palette('Mineral', [
    '#C2603F', '#D08A3E', '#4E7C8A', '#6E7683', '#4F8C7B',
    '#7E9B55', '#C0A03C', '#7A6B99', '#A96D85', '#8C4F64', '#8E8C86',
  ]),
  ocean: palette('Ocean', [
    '#0B3C5D', '#1D6A8C', '#2E8BA6', '#3FA7B8', '#57C1C4',
    '#79D3C4', '#9FDFC4', '#C2E8CB', '#1B5E7A', '#144B63', '#7D9AA6',
  ]),
  ember: palette('Ember', [
    '#7A1010', '#A32A0E', '#C24B12', '#D96D18', '#E68A22',
    '#EFA835', '#F3C24E', '#F7D97A', '#8E2C2C', '#5E0E0E', '#8A7166',
  ]),
  mono: palette('Graphite', [
    '#2E3440', '#3B4252', '#434C5E', '#4C566A', '#5A6578',
    '#697585', '#788393', '#8792A1', '#3A4150', '#2A303C', '#9AA3AF',
  ]),
};

export const THEMES = {
  paper:      { name: 'Paper',     bg: '#FFFFFF', ink: '#15191F', muted: '#5C6672', rule: '#D9DEE5', dark: false },
  cream:      { name: 'Cream',     bg: '#FAF6EE', ink: '#2A2118', muted: '#6E6152', rule: '#E2D8C6', dark: false },
  cool:       { name: 'Cool grey', bg: '#F2F5F8', ink: '#1A2029', muted: '#5A6672', rule: '#D3DAE3', dark: false },
  slate:      { name: 'Slate',     bg: '#1B2027', ink: '#F0F3F7', muted: '#9AA6B4', rule: '#333C48', dark: true },
  midnight:   { name: 'Midnight',  bg: '#0C1220', ink: '#E3ECF9', muted: '#8FA1BC', rule: '#22304A', dark: true },
  blueprint:  { name: 'Blueprint', bg: '#0E3A5E', ink: '#DCEEFF', muted: '#8FBCE0', rule: '#2A5F8C', dark: true, grid: true },
  carbon:     { name: 'Carbon',    bg: '#171717', ink: '#F0F0F0', muted: '#9A9A9A', rule: '#333333', dark: true },
};

export const ACCENT_MODES = {
  solid:    'Solid fill',
  tint:     'Soft tint',
  gradient: 'Gradient',
  band:     'Accent band',
  outline:  'Outline only',
  none:     'No accent',
};

export const COLOR_BY = {
  category: 'Element category',
  block:    'Orbital block (s/p/d/f)',
  phase:    'State at room temperature',
  fixed:    'One fixed color',
};

const BLOCK_HUES = { s: 'alkali', p: 'nonmetal', d: 'transition', f: 'lanthanide' };
const PHASE_HUES = { solid: 'transition', liquid: 'metalloid', gas: 'noble' };

/** Resolve the accent color for an element under the current settings. */
export function accentFor(el, cfg) {
  if (cfg.colorBy === 'fixed') return cfg.fixedColor;
  const colors = PALETTES[cfg.palette].colors;
  if (cfg.colorBy === 'block') return colors[BLOCK_HUES[el.blk] || 'unknown'];
  if (cfg.colorBy === 'phase') return colors[PHASE_HUES[el.phase] || 'unknown'];
  return colors[el.cat] || colors.unknown;
}

// Family names are single-quoted so a stack can sit inside a double-quoted
// SVG font-family attribute without terminating it.
export const FONTS = [
  { id: "system", label: "System UI", stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { id: "inter", label: "Inter", google: "Inter:wght@300;400;600;800", stack: "'Inter', sans-serif" },
  { id: "outfit", label: "Outfit", google: "Outfit:wght@300;400;600;800", stack: "'Outfit', sans-serif" },
  { id: "worksans", label: "Work Sans", google: "Work+Sans:wght@300;400;600;800", stack: "'Work Sans', sans-serif" },
  { id: "spacegro", label: "Space Grotesk", google: "Space+Grotesk:wght@400;500;700", stack: "'Space Grotesk', sans-serif" },
  { id: "plexsans", label: "IBM Plex Sans", google: "IBM+Plex+Sans:wght@300;400;600;700", stack: "'IBM Plex Sans', sans-serif" },
  { id: "oswald", label: "Oswald", google: "Oswald:wght@300;400;600", stack: "'Oswald', sans-serif" },
  { id: "bebas", label: "Bebas Neue", google: "Bebas+Neue", stack: "'Bebas Neue', sans-serif" },
  { id: "archivo", label: "Archivo Black", google: "Archivo+Black", stack: "'Archivo Black', sans-serif" },
  { id: "orbitron", label: "Orbitron", google: "Orbitron:wght@400;700;900", stack: "'Orbitron', sans-serif" },
  { id: "sourceserif", label: "Source Serif 4", google: "Source+Serif+4:wght@300;400;600;700", stack: "'Source Serif 4', serif" },
  { id: "playfair", label: "Playfair Display", google: "Playfair+Display:wght@400;600;800", stack: "'Playfair Display', serif" },
  { id: "fraunces", label: "Fraunces", google: "Fraunces:opsz,wght@9..144,300;9..144,500;9..144,800", stack: "'Fraunces', serif" },
  { id: "lora", label: "Lora", google: "Lora:wght@400;600;700", stack: "'Lora', serif" },
  { id: "spectral", label: "Spectral", google: "Spectral:wght@300;400;600;800", stack: "'Spectral', serif" },
  { id: "cormorant", label: "Cormorant Garamond", google: "Cormorant+Garamond:wght@400;600;700", stack: "'Cormorant Garamond', serif" },
  { id: "cinzel", label: "Cinzel", google: "Cinzel:wght@400;600;800", stack: "'Cinzel', serif" },
  { id: "librebask", label: "Libre Baskerville", google: "Libre+Baskerville:wght@400;700", stack: "'Libre Baskerville', serif" },
  { id: "plexmono", label: "IBM Plex Mono", google: "IBM+Plex+Mono:wght@300;400;600;700", stack: "'IBM Plex Mono', monospace" },
  { id: "jetbrains", label: "JetBrains Mono", google: "JetBrains+Mono:wght@300;400;600;800", stack: "'JetBrains Mono', monospace" },
];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

export const LAYOUTS = {
  classic:  { name: 'Classic tile',  blurb: 'Number, mass, symbol, name — the familiar periodic-table cell.', slots: 4, diagram: 'band' },
  modern:   { name: 'Modern',        blurb: 'Accent rule, generous whitespace, data set below the symbol.',   slots: 2, diagram: 'band' },
  study:    { name: 'Study card',    blurb: 'Symbol on the left, a diagram on the right, properties beneath.', slots: 2, diagram: 'panel' },
  poster:   { name: 'Poster',        blurb: 'Oversized symbol as the ground, name and facts layered over it.', slots: 2, diagram: 'watermark' },
  data:     { name: 'Data sheet',    blurb: 'Compact header with a labelled table of every selected property.', slots: 2, diagram: 'panel' },
  diagram:  { name: 'Diagram first', blurb: 'The chosen diagram fills the card; the symbol becomes a caption.', slots: 2, diagram: 'hero' },
};

export const DIAGRAMS = {
  none:     'None',
  lewis:    'Lewis electron dot',
  shell:    'Bohr shell diagram',
  orbital:  'Orbital box diagram',
  orbitalValence: 'Orbital boxes (valence only)',
};

/** Relative luminance per WCAG, used to pick readable ink over a solid fill. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');
}

export function mix(a, b, t) {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  return rgbToHex([ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t]);
}

export function shade(hex, amount) {
  return mix(hex, amount < 0 ? '#000000' : '#ffffff', Math.abs(amount));
}

/** Pick whichever of two inks reads better on `bg`. */
export function readableInk(bg, light = '#FFFFFF', dark = '#14181F') {
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

export const DEFAULT_CONFIG = {
  element: 6,
  layout: 'classic',
  palette: 'spectrum',
  theme: 'paper',
  accentMode: 'tint',
  colorBy: 'category',
  fixedColor: '#3F7FBF',
  displayFont: 'inter',
  bodyFont: 'inter',
  symbolWeight: 700,
  width: 520,
  height: 520,
  padding: 34,
  radius: 22,
  borderWidth: 3,
  borderStyle: 'accent',
  shadow: false,
  diagram: 'lewis',
  diagramScale: 1,
  diagramLabels: true,
  lewisExtended: false,
  fields: ['configShorthand'],
  cornerTopLeft: 'z',
  cornerTopRight: 'mass',
  cornerBottomLeft: 'category',
  cornerBottomRight: 'phase',
  showName: true,
  showCorners: true,
  tempUnit: 'K',
  usSpelling: false,
  uppercaseName: false,
  letterSpacing: 0,
  symbolScale: 1,
};

/**
 * Curated starting points. Each preset is a partial config merged over the
 * current one, so the chosen element and card size survive a preset change.
 */
export const PRESETS = {
  classroom: { name: 'Classroom', cfg: {
    layout: 'classic', theme: 'paper', accentMode: 'tint', palette: 'spectrum',
    displayFont: 'inter', bodyFont: 'inter', symbolWeight: 700, diagram: 'lewis',
    fields: ['configShorthand'], radius: 20, borderWidth: 2, borderStyle: 'accent', shadow: false } },
  editorial: { name: 'Editorial', cfg: {
    layout: 'modern', theme: 'cream', accentMode: 'band', palette: 'muted',
    displayFont: 'fraunces', bodyFont: 'worksans', symbolWeight: 500, diagram: 'none',
    fields: ['mass', 'category', 'configShorthand'], radius: 4, borderWidth: 0, borderStyle: 'none', shadow: true } },
  blueprint: { name: 'Blueprint', cfg: {
    layout: 'study', theme: 'blueprint', accentMode: 'none', palette: 'ocean',
    displayFont: 'plexmono', bodyFont: 'plexmono', symbolWeight: 600, diagram: 'shell',
    fields: ['category', 'en', 'oxidation', 'configShorthand'], radius: 2, borderWidth: 1, borderStyle: 'rule', shadow: false } },
  neon: { name: 'Neon lab', cfg: {
    layout: 'poster', theme: 'midnight', accentMode: 'gradient', palette: 'neon',
    displayFont: 'orbitron', bodyFont: 'spacegro', symbolWeight: 700, diagram: 'shell',
    fields: ['mass', 'configShorthand'], radius: 18, borderWidth: 0, borderStyle: 'none', shadow: true } },
  letterpress: { name: 'Letterpress', cfg: {
    layout: 'poster', theme: 'cream', accentMode: 'none', palette: 'jewel',
    displayFont: 'cinzel', bodyFont: 'librebask', symbolWeight: 600, diagram: 'none',
    fields: ['mass', 'category'], radius: 0, borderWidth: 2, borderStyle: 'ink', shadow: false, letterSpacing: 2 } },
  labsheet: { name: 'Lab sheet', cfg: {
    layout: 'data', theme: 'paper', accentMode: 'outline', palette: 'mineral',
    displayFont: 'plexsans', bodyFont: 'plexmono', symbolWeight: 600, diagram: 'lewis',
    fields: ['category', 'en', 'melt', 'boil', 'density', 'oxidation', 'configShorthand'],
    radius: 4, borderWidth: 1, borderStyle: 'rule', shadow: false } },
  chalkboard: { name: 'Chalkboard', cfg: {
    layout: 'classic', theme: 'carbon', accentMode: 'tint', palette: 'pastel',
    displayFont: 'archivo', bodyFont: 'worksans', symbolWeight: 400, diagram: 'orbitalValence',
    fields: ['shells'], radius: 14, borderWidth: 0, borderStyle: 'none', shadow: false } },
  minimal: { name: 'Minimal', cfg: {
    layout: 'classic', theme: 'paper', accentMode: 'none', palette: 'mono',
    displayFont: 'inter', bodyFont: 'inter', symbolWeight: 300, diagram: 'none',
    fields: [], cornerBottomLeft: 'none', cornerBottomRight: 'none',
    radius: 12, borderWidth: 1, borderStyle: 'rule', shadow: false } },
  atlas: { name: 'Atlas', cfg: {
    layout: 'study', theme: 'cool', accentMode: 'tint', palette: 'spectrum',
    displayFont: 'outfit', bodyFont: 'outfit', symbolWeight: 600, diagram: 'shell',
    fields: ['category', 'en', 'melt', 'boil', 'oxidation'], radius: 16, borderWidth: 0, borderStyle: 'none', shadow: true } },
  orbitals: { name: 'Orbital focus', cfg: {
    layout: 'diagram', theme: 'slate', accentMode: 'solid', palette: 'ocean',
    displayFont: 'spacegro', bodyFont: 'spacegro', symbolWeight: 600, diagram: 'orbital',
    fields: ['configShorthand'], radius: 16, borderWidth: 0, borderStyle: 'none', shadow: true } },
};
