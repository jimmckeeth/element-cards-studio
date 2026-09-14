/**
 * app.js — wiring: state, controls, the periodic table picker and exports.
 *
 * The whole UI is a pure function of one plain `config` object. Every control
 * writes into it and asks for a re-render, which keeps the preview, the share
 * link and the exported file in lockstep.
 */

import { ELEMENTS, BY_Z, CATEGORIES, gridPosition } from './elements.js';
import { CORNER_FIELDS, DETAIL_FIELDS, FIELDS, elementName } from './fields.js';
import { renderCard, renderSheet } from './render.js';
import {
  DEFAULT_CONFIG, PALETTES, THEMES, ACCENT_MODES, COLOR_BY, FONTS, LAYOUTS,
  DIAGRAMS, PRESETS, accentFor,
} from './theme.js';
import * as exporter from './export.js';

const STORAGE_KEY = 'element-card-studio:v1';
const $ = (sel) => document.querySelector(sel);

let config = { ...DEFAULT_CONFIG };
let selection = new Set();
let renderQueued = false;
// The id of the last preset applied, used only to name downloaded files
// ("neon-lab" says far more than the layout id "poster"). Cleared on reset.
let activePreset = null;

/* ------------------------------------------------------------------ state */

function currentElement() {
  return BY_Z[config.element] ?? BY_Z[6];
}

/** Drop unknown keys and clamp numbers so a stale link can't break the app. */
function sanitize(raw) {
  const out = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, def] of Object.entries(DEFAULT_CONFIG)) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(def)) out[key] = Array.isArray(v) ? v.filter((id) => FIELDS[id]) : def;
    else if (typeof def === 'number') out[key] = Number.isFinite(Number(v)) ? Number(v) : def;
    else if (typeof def === 'boolean') out[key] = Boolean(v);
    else out[key] = String(v);
  }
  out.element = Math.min(118, Math.max(1, Math.round(out.element)));
  out.width = Math.min(2000, Math.max(160, Math.round(out.width)));
  out.height = Math.min(2000, Math.max(160, Math.round(out.height)));
  if (!LAYOUTS[out.layout]) out.layout = DEFAULT_CONFIG.layout;
  if (!THEMES[out.theme]) out.theme = DEFAULT_CONFIG.theme;
  if (!PALETTES[out.palette]) out.palette = DEFAULT_CONFIG.palette;
  if (!ACCENT_MODES[out.accentMode]) out.accentMode = DEFAULT_CONFIG.accentMode;
  if (!DIAGRAMS[out.diagram]) out.diagram = DEFAULT_CONFIG.diagram;
  return out;
}

function encodeConfig(cfg) {
  const diff = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (JSON.stringify(v) !== JSON.stringify(DEFAULT_CONFIG[k])) diff[k] = v;
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(diff)))).replace(/=+$/, '');
}

function decodeConfig(str) {
  try {
    return sanitize(JSON.parse(decodeURIComponent(escape(atob(str)))));
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* private browsing — the design simply won't be remembered */
  }
}

function restore() {
  const hash = location.hash.replace(/^#d=/, '');
  if (hash && location.hash.startsWith('#d=')) {
    const fromLink = decodeConfig(hash);
    if (fromLink) return fromLink;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return sanitize(JSON.parse(saved));
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

/* --------------------------------------------------------------- controls */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

function field(labelText, control, hint) {
  return el('div', { class: 'field' }, [
    el('label', { text: labelText, for: control.id || null }),
    control,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  ]);
}

function select(key, options, onChange, { disabled = false } = {}) {
  const node = el('select', { id: `ctl-${key}`, disabled });
  for (const [value, label] of options) {
    node.append(el('option', { value, text: label, selected: String(config[key]) === String(value) }));
  }
  node.addEventListener('change', () => {
    config[key] = node.value;
    (onChange || update)();
  });
  return node;
}

function range(key, { min, max, step = 1, format = (v) => v }) {
  const out = el('span', { class: 'range-val', text: format(config[key]) });
  const input = el('input', { type: 'range', min, max, step, value: config[key], id: `ctl-${key}` });
  input.addEventListener('input', () => {
    config[key] = Number(input.value);
    out.textContent = format(config[key]);
    update();
  });
  return el('div', { class: 'field' }, [
    el('div', { class: 'range-head' }, [el('span', { class: 'field-label', text: rangeLabels[key] }), out]),
    input,
  ]);
}

const rangeLabels = {
  width: 'Width', height: 'Height', padding: 'Padding', radius: 'Corner radius',
  borderWidth: 'Border width', symbolScale: 'Symbol size', letterSpacing: 'Letter spacing',
  diagramScale: 'Diagram size', symbolWeight: 'Symbol weight',
};

function toggle(key, labelText, { disabled = false } = {}) {
  const input = el('input', { type: 'checkbox', checked: config[key], disabled });
  input.addEventListener('change', () => {
    config[key] = input.checked;
    update();
  });
  const label = el('label', { class: 'check' }, [input, document.createTextNode(' ' + labelText)]);
  if (disabled) label.classList.add('check-disabled');
  return label;
}

function group(title, open, body) {
  return el('details', { class: 'group', open: open || false }, [
    el('summary', { text: title }),
    el('div', { class: 'group-body' }, body),
  ]);
}

function presetChips() {
  const wrap = el('div', { class: 'chips' });
  for (const [id, preset] of Object.entries(PRESETS)) {
    wrap.append(el('button', {
      type: 'button', class: 'chip', text: preset.name,
      onclick: () => {
        config = sanitize({ ...config, ...preset.cfg });
        activePreset = id;
        buildControls();
        update();
      },
    }));
  }
  return wrap;
}

function paletteSwatches() {
  const wrap = el('div', { class: 'swatches' });
  for (const [id, pal] of Object.entries(PALETTES)) {
    const btn = el('button', {
      type: 'button', class: 'swatch', title: pal.name,
      'aria-label': pal.name, 'aria-pressed': String(config.palette === id),
      onclick: () => {
        config.palette = id;
        wrap.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        update();
      },
    });
    for (const key of ['alkali', 'transition', 'nonmetal', 'noble']) {
      btn.append(el('span', { style: `background:${pal.colors[key]}` }));
    }
    wrap.append(btn);
  }
  return wrap;
}

/** Checkbox list for the stacked detail fields; order follows click order. */
function detailFieldList() {
  const wrap = el('div', { class: 'fieldlist' });
  for (const id of DETAIL_FIELDS) {
    const input = el('input', { type: 'checkbox', checked: config.fields.includes(id) });
    input.addEventListener('change', () => {
      config.fields = input.checked
        ? [...config.fields, id]
        : config.fields.filter((f) => f !== id);
      update();
    });
    wrap.append(el('label', { class: 'check' }, [input, document.createTextNode(' ' + FIELDS[id].label)]));
  }
  return wrap;
}

const cornerOptions = () =>
  CORNER_FIELDS.map((id) => [id, id === 'none' ? '— empty —' : FIELDS[id].label]);

function buildControls() {
  const host = $('#controls');
  // Rebuilding replaces every <details>, so remember what the user had open.
  const openState = new Map(
    [...host.querySelectorAll('.group')].map((g) => [g.querySelector('summary').textContent, g.open]),
  );
  host.textContent = '';
  const restoreOpen = () => {
    for (const g of host.querySelectorAll('.group')) {
      const was = openState.get(g.querySelector('summary').textContent);
      if (was !== undefined) g.open = was;
    }
  };

  host.append(group('Style presets', true, [
    presetChips(),
    el('p', { class: 'order-note', text: 'A preset changes the look only — your element and card size stay put.' }),
  ]));

  host.append(group('Layout & size', true, [
    field('Layout', select('layout', Object.entries(LAYOUTS).map(([id, l]) => [id, l.name]), () => {
      buildControls();   // corner-data controls only apply to some layouts
      update();
    })),
    el('p', { class: 'field-hint', id: 'layout-blurb', text: LAYOUTS[config.layout].blurb }),
    el('div', { class: 'chips' }, [
      ...[['Square', 1, 1], ['Portrait 4:5', 4, 5], ['Card 3:4', 3, 4], ['Wide 4:3', 4, 3], ['Banner 16:9', 16, 9]]
        .map(([label, w, h]) => el('button', {
          type: 'button', class: 'chip', text: label,
          onclick: () => {
            const base = Math.max(config.width, config.height);
            config.width = Math.round(base * (w >= h ? 1 : w / h));
            config.height = Math.round(base * (h >= w ? 1 : h / w));
            buildControls();
            update();
          },
        })),
    ]),
    range('width', { min: 200, max: 1200, step: 10, format: (v) => `${v} px` }),
    range('height', { min: 200, max: 1200, step: 10, format: (v) => `${v} px` }),
    range('padding', { min: 0, max: 100, format: (v) => `${v} px` }),
    range('radius', { min: 0, max: 120, format: (v) => `${v} px` }),
  ]));

  host.append(group('Color', true, [
    field('Color by', select('colorBy', Object.entries(COLOR_BY), () => {
      buildControls();   // the fixed-color picker appears or disappears
      update();
    })),
    (() => {
      const wrap = el('div', { class: 'field' });
      wrap.append(el('span', { class: 'field-label', text: 'Palette' }), paletteSwatches());
      return wrap;
    })(),
    config.colorBy === 'fixed'
      ? (() => {
          const input = el('input', { type: 'color', value: config.fixedColor, id: 'ctl-fixedColor' });
          input.addEventListener('input', () => {
            config.fixedColor = input.value;
            update();
          });
          return field('Card color', input);
        })()
      : null,
    field('Paper', select('theme', Object.entries(THEMES).map(([id, t]) => [id, t.name]))),
    field('Accent treatment', select('accentMode', Object.entries(ACCENT_MODES))),
  ]));

  host.append(group('Typography', false, [
    field('Symbol font', select('displayFont', FONTS.map((f) => [f.id, f.label]))),
    field('Text font', select('bodyFont', FONTS.map((f) => [f.id, f.label]))),
    field('Symbol weight', select('symbolWeight', [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold']])),
    range('symbolScale', { min: 0.5, max: 1.6, step: 0.05, format: (v) => `${Math.round(v * 100)}%` }),
    range('letterSpacing', { min: -4, max: 14, step: 0.5, format: (v) => `${v} px` }),
    toggle('uppercaseName', 'Set the element name in capitals'),
    toggle('usSpelling', 'US spellings (aluminum, cesium, sulfur)'),
  ]));

  host.append(group('Diagram', true, [
    field('Diagram', select('diagram', Object.entries(DIAGRAMS))),
    range('diagramScale', { min: 0.4, max: 1.8, step: 0.05, format: (v) => `${Math.round(v * 100)}%` }),
    toggle('diagramLabels', 'Show diagram labels'),
    toggle('lewisExtended', 'Lewis: include d/f electrons'),
    el('p', { class: 'order-note', id: 'diagram-note' }),
  ]));

  // Corner data (the four small labels in the tile's corners) is only ever
  // drawn by the Classic tile layout — the controls are disabled elsewhere
  // rather than left live with no visible effect.
  const cornersApply = config.layout === 'classic';
  const cornersLabel = cornersApply
    ? 'Show corner data'
    : `Show corner data (${LAYOUTS.classic.name} layout only)`;

  host.append(group('Content', false, [
    toggle('showName', 'Show the element name'),
    toggle('showCorners', cornersLabel, { disabled: !cornersApply }),
    !cornersApply
      ? el('p', { class: 'field-hint', text: `Switch the layout to "${LAYOUTS.classic.name}" to place data in the corners.` })
      : null,
    el('div', { class: 'row-2' }, [
      field('Top left', select('cornerTopLeft', cornerOptions(), null, { disabled: !cornersApply })),
      field('Top right', select('cornerTopRight', cornerOptions(), null, { disabled: !cornersApply })),
    ]),
    el('div', { class: 'row-2' }, [
      field('Bottom left', select('cornerBottomLeft', cornerOptions(), null, { disabled: !cornersApply })),
      field('Bottom right', select('cornerBottomRight', cornerOptions(), null, { disabled: !cornersApply })),
    ]),
    field('Temperature unit', select('tempUnit', [['K', 'Kelvin'], ['C', 'Celsius'], ['F', 'Fahrenheit']])),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Details to list' }),
      detailFieldList(),
      el('p', { class: 'order-note', text: 'Listed in the order you tick them. Fields already shown in a corner are skipped.' }),
    ]),
  ]));

  host.append(group('Frame', false, [
    range('borderWidth', { min: 0, max: 16, format: (v) => `${v} px` }),
    field('Border color', select('borderStyle', [['accent', 'Element color'], ['ink', 'Text color'], ['rule', 'Hairline'], ['none', 'No border']])),
    toggle('shadow', 'Drop shadow'),
  ]));

  restoreOpen();
}

/* ------------------------------------------------------------ periodic table */

function buildTable() {
  const host = $('#ptable');
  host.textContent = '';
  const cells = new Map();

  const make = (element) => {
    const accent = accentFor(element, config);
    const btn = el('button', {
      type: 'button', class: 'pt-cell', 'data-z': element.z,
      title: `${element.name} · ${element.sym} · ${element.z}`,
      style: `background:${accent}20; border-color:${accent}; color:${accent}`,
    }, [
      el('span', { class: 'pt-z', text: element.z }),
      el('span', { class: 'pt-sym', text: element.sym }),
    ]);
    btn.addEventListener('click', (ev) => {
      if (ev.shiftKey) {
        selection.has(element.z) ? selection.delete(element.z) : selection.add(element.z);
        refreshTableState();
        return;
      }
      config.element = element.z;
      update();
    });
    cells.set(element.z, btn);
    return btn;
  };

  // Main block, rows 1-7.
  const occupied = new Map();
  for (const element of ELEMENTS) {
    const { col, row } = gridPosition(element);
    if (row <= 7 && col) occupied.set(`${row}:${col}`, element);
  }
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 18; col++) {
      const element = occupied.get(`${row}:${col}`);
      host.append(element ? make(element) : el('span', { class: 'pt-gap' }));
    }
  }

  host.append(el('span', { class: 'pt-spacer' }));
  for (const [row, label] of [[9, 'Lanthanides'], [10, 'Actinides']]) {
    host.append(el('span', { class: 'pt-note', text: label }));
    const inRow = ELEMENTS.filter((e) => gridPosition(e).row === row).sort((a, b) => a.z - b.z);
    for (const element of inRow) host.append(make(element));
    host.append(el('span', { class: 'pt-gap' }));
  }

  host._cells = cells;
  refreshTableState();
}

function refreshTableState() {
  const cells = $('#ptable')._cells;
  if (!cells) return;
  for (const [z, node] of cells) {
    node.setAttribute('aria-current', String(z === config.element));
    node.dataset.selected = String(selection.has(z));
  }
  const n = selection.size;
  $('#sel-count').textContent = n ? `${n} selected for sheet` : '';
  $('#btn-sheet').disabled = n === 0;
  $('#btn-sel-clear').disabled = n === 0;
}

function recolorTable() {
  const cells = $('#ptable')?._cells;
  if (!cells) return;
  for (const [z, node] of cells) {
    const accent = accentFor(BY_Z[z], config);
    node.style.background = `${accent}20`;
    node.style.borderColor = accent;
    node.style.color = accent;
  }
}

function buildLegend() {
  const host = $('#legend');
  host.textContent = '';
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    host.append(el('span', { class: 'legend-item' }, [
      el('span', { class: 'legend-dot', style: `background:${PALETTES[config.palette].colors[key]}` }),
      document.createTextNode(cat.label),
    ]));
  }
}

function wireSearch() {
  const input = $('#el-search');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const cells = $('#ptable')._cells;
    for (const [z, node] of cells) {
      const element = BY_Z[z];
      const hit = !q
        || element.name.toLowerCase().includes(q)
        || (element.alt || '').toLowerCase().includes(q)
        || element.sym.toLowerCase() === q
        || element.sym.toLowerCase().startsWith(q)
        || String(z) === q;
      node.classList.toggle('dim', !hit);
    }
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const q = input.value.trim().toLowerCase();
    const hit = ELEMENTS.find((e) => e.sym.toLowerCase() === q || String(e.z) === q)
      || ELEMENTS.find((e) => e.name.toLowerCase().startsWith(q));
    if (hit) {
      config.element = hit.z;
      update();
    }
  });
}

/* ---------------------------------------------------------------- rendering */

function currentSvg() {
  return renderCard(currentElement(), config);
}

// Text is positioned from measured glyph metrics, so a card laid out before its
// web font arrives is laid out against the fallback. Fonts are fetched only as
// they are actually chosen, and the card is redrawn once they land.
const fontsRequested = new Set();
function ensureFonts() {
  const needed = exporter.fontsUsedBy(config).filter((id) => !fontsRequested.has(id));
  if (!needed.length) return;
  needed.forEach((id) => fontsRequested.add(id));
  exporter.ensurePreviewFonts(exporter.fontsUsedBy(config))
    .then(() => draw())
    .catch(() => { /* offline: the system fallback stays */ });
}

function update() {
  persist();
  ensureFonts();
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    draw();
  });
}

function draw() {
  const element = currentElement();
  $('#preview').innerHTML = currentSvg();
  $('#stage-title').textContent = elementName(element, config);
  $('#stage-sub').textContent =
    `${element.sym} · ${CATEGORIES[element.cat].label} · group ${element.grp ?? 'f-block'}, period ${element.per}`
    + (element.pred ? ' · configuration predicted' : '');

  const note = $('#diagram-note');
  if (note) {
    const messages = {
      lewis: element.blk === 's' || element.blk === 'p'
        ? 'Valence electrons are placed one per side before any side pairs up.'
        : 'Lewis structures are conventionally drawn for main-group elements; the outer s electrons are shown here.',
      shell: 'Electrons per principal shell, innermost first.',
      orbital: "Aufbau order, filled by Hund's rule.",
      orbitalValence: 'Subshells beyond the noble-gas core only.',
      none: '',
    };
    note.textContent = messages[config.diagram] ?? '';
  }

  recolorTable();
  refreshTableState();
  buildLegend();
  history.replaceState(null, '', `#d=${encodeConfig(config)}`);
}

/* ------------------------------------------------------------------ toasts */

let toastTimer = null;
function toast(message, isError = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), isError ? 5200 : 2600);
}

/* ----------------------------------------------------------------- exports */

/**
 * Prepare the SVG for export. Rasterising always needs embedded fonts, since
 * an <img> will not fetch a web font; for SVG downloads it is the user's call.
 */
async function exportSvgString(svg, format, embedRequested) {
  const needsFonts = format !== 'svg' || embedRequested;
  if (!needsFonts) return svg;
  try {
    const css = await exporter.buildFontCss(exporter.fontsUsedBy(config));
    return exporter.withEmbeddedFonts(svg, css);
  } catch (err) {
    toast('Fonts could not be embedded — exporting with system fallbacks.', true);
    return svg;
  }
}

async function withBusy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  document.body.classList.add('busy');
  try {
    await fn();
  } catch (err) {
    toast(err.message || 'Export failed.', true);
  } finally {
    button.disabled = false;
    button.textContent = label;
    document.body.classList.remove('busy');
  }
}

function wireExport() {
  const formatSel = $('#ex-format');
  const scaleField = $('#ex-scale-field');
  const note = $('#ex-note');

  const syncFormat = () => {
    const isVector = formatSel.value === 'svg';
    scaleField.style.visibility = isVector ? 'hidden' : 'visible';
    $('#ex-transparent').disabled = false;
    note.textContent = {
      svg: 'Vector and infinitely scalable. Embedding fonts makes the file self-contained but larger; leave it off if the machine opening it already has the fonts.',
      png: 'Lossless raster with an alpha channel. 4× or more is a good starting point for print.',
      webp: 'Encoded at quality 1.0, which Chromium-based browsers write losslessly. Safari and Firefox may fall back to lossy.',
    }[formatSel.value];
  };
  formatSel.addEventListener('change', syncFormat);
  syncFormat();

  $('#btn-download').addEventListener('click', (ev) => withBusy(ev.currentTarget, async () => {
    const format = formatSel.value;
    const svg = await exportSvgString(currentSvg(), format, $('#ex-embed').checked);
    const blob = await exporter.toBlob(svg, format, {
      scale: Number($('#ex-scale').value),
      background: $('#ex-transparent').checked ? null : '#ffffff',
    });
    const name = exporter.filenameFor(currentElement(), config, format, activePreset && PRESETS[activePreset].name);
    exporter.download(blob, name);
    if (format === 'webp' && !(await exporter.isLosslessWebp(blob))) {
      toast(`Downloaded ${name} — but this browser encoded it lossily. Use PNG for a lossless raster.`, true);
    } else {
      toast(`Downloaded ${name}`);
    }
  }));

  $('#btn-copy-png').addEventListener('click', (ev) => withBusy(ev.currentTarget, async () => {
    const svg = await exportSvgString(currentSvg(), 'png', true);
    await exporter.copyPng(svg, {
      scale: Number($('#ex-scale').value),
      background: $('#ex-transparent').checked ? null : '#ffffff',
    });
    toast('Image copied to the clipboard');
  }));

  $('#btn-copy-svg').addEventListener('click', (ev) => withBusy(ev.currentTarget, async () => {
    const svg = await exportSvgString(currentSvg(), 'svg', $('#ex-embed').checked);
    await navigator.clipboard.writeText(svg);
    toast('SVG markup copied');
  }));
}

function wireSheet() {
  const dialog = $('#sheet-dialog');
  const describeSheet = () => {
    const cols = Math.max(1, Math.min(Number($('#sheet-cols').value) || 6, selection.size));
    const rows = Math.ceil(selection.size / cols);
    const gap = Number($('#sheet-gap').value) || 0;
    const w = cols * config.width + (cols - 1) * gap;
    const h = rows * config.height + (rows - 1) * gap;
    const scale = Number($('#sheet-scale').value) || 1;
    $('#sheet-info').textContent =
      `${selection.size} element${selection.size === 1 ? '' : 's'} in ${cols} × ${rows} — `
      + `${w * scale} × ${h * scale} px.`;
  };
  for (const id of ['#sheet-cols', '#sheet-gap', '#sheet-scale']) {
    $(id).addEventListener('input', describeSheet);
    $(id).addEventListener('change', describeSheet);
  }
  $('#btn-sheet').addEventListener('click', () => {
    describeSheet();
    dialog.showModal();
  });
  $('#btn-sheet-go').addEventListener('click', (ev) => withBusy(ev.currentTarget, async () => {
    const elements = [...selection].sort((a, b) => a - b).map((z) => BY_Z[z]);
    const format = $('#sheet-format').value;
    const svg = await exportSvgString(
      renderSheet(elements, config, {
        columns: Number($('#sheet-cols').value) || 6,
        gap: Number($('#sheet-gap').value) || 0,
      }),
      format,
      $('#ex-embed').checked,
    );
    const blob = await exporter.toBlob(svg, format, {
      scale: Number($('#sheet-scale').value),
      background: $('#ex-transparent').checked ? null : '#ffffff',
    });
    const styleBit = activePreset ? `-${activePreset}` : '';
    exporter.download(blob, `element-sheet${styleBit}-${elements.length}.${format}`);
    dialog.close();
    toast(`Downloaded a sheet of ${elements.length} cards`);
  }));
  $('#btn-sel-clear').addEventListener('click', () => {
    selection.clear();
    refreshTableState();
  });
}

function wireTopbar() {
  $('#btn-reset').addEventListener('click', () => {
    config = { ...DEFAULT_CONFIG };
    activePreset = null;
    buildControls();
    update();
    toast('Reset to defaults');
  });

  $('#btn-share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#d=${encodeConfig(config)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — it restores this exact design');
    } catch {
      toast(url, true);
    }
  });

  $('#btn-random').addEventListener('click', () => {
    const pick = (obj) => {
      const keys = Object.keys(obj);
      return keys[Math.floor(Math.random() * keys.length)];
    };
    const presetId = pick(PRESETS);
    const preset = PRESETS[presetId];
    config = sanitize({
      ...config, ...preset.cfg,
      element: 1 + Math.floor(Math.random() * 118),
      palette: pick(PALETTES),
    });
    activePreset = presetId;
    buildControls();
    update();
    toast(`${preset.name} · ${elementName(currentElement(), config)}`);
  });
}

/* -------------------------------------------------------------------- boot */

function boot() {
  config = restore();
  buildControls();
  buildTable();
  buildLegend();
  wireSearch();
  wireExport();
  wireSheet();
  wireTopbar();
  draw();
  persist();
  ensureFonts();
}

boot();
