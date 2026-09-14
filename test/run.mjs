/**
 * test/run.mjs — no-dependency test suite.
 *
 * Run with `node test/run.mjs`. The chemistry assertions matter most: the
 * diagrams are only as trustworthy as the configurations they derive from.
 */

import { ELEMENTS, BY_SYMBOL, BY_Z, gridPosition } from '../js/elements.js';
import * as chem from '../js/chem.js';
import * as fields from '../js/fields.js';
import * as diagrams from '../js/diagrams.js';
import { renderCard, renderSheet } from '../js/render.js';
import { DEFAULT_CONFIG, LAYOUTS, THEMES, PALETTES, ACCENT_MODES, DIAGRAMS, FONTS, PRESETS } from '../js/theme.js';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function equal(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`);
}

/* ------------------------------------------------------------------- data */

check('dataset covers Z 1-118 in order', () => {
  equal(ELEMENTS.length, 118, 'element count:');
  ELEMENTS.forEach((el, i) => assert(el.z === i + 1, `element ${i} has z ${el.z}`));
});

check('every element has the fields layouts rely on', () => {
  for (const el of ELEMENTS) {
    for (const key of ['sym', 'name', 'mass', 'cat', 'per', 'blk', 'cfg', 'phase']) {
      assert(el[key] !== undefined && el[key] !== null, `${el.sym} is missing ${key}`);
    }
    assert(/^[A-Z][a-z]?$/.test(el.sym), `${el.sym} is not a valid symbol`);
    assert(el.per >= 1 && el.per <= 7, `${el.sym} has period ${el.per}`);
  }
});

check('symbols and names are unique', () => {
  equal(new Set(ELEMENTS.map((e) => e.sym)).size, 118, 'unique symbols:');
  equal(new Set(ELEMENTS.map((e) => e.name)).size, 118, 'unique names:');
});

check('bracketed masses correspond to elements with no stable isotope', () => {
  for (const el of ELEMENTS) {
    const printed = fields.formatMass(el);
    equal(printed.startsWith('['), Boolean(el.synth), `${el.sym} mass bracketing:`);
  }
  // Spot-check the well-known cases in both directions.
  assert(fields.formatMass(BY_SYMBOL.Tc) === '[98]', 'technetium should be bracketed');
  assert(fields.formatMass(BY_SYMBOL.U) === '238.03', 'uranium should not be bracketed');
  assert(fields.formatMass(BY_SYMBOL.Bi) === '208.98', 'bismuth should not be bracketed');
});

check('every element occupies a distinct cell of the printed table', () => {
  const seen = new Set();
  for (const el of ELEMENTS) {
    const { col, row } = gridPosition(el);
    assert(col >= 1 && col <= 18, `${el.sym} column ${col}`);
    const key = `${row}:${col}`;
    assert(!seen.has(key), `${el.sym} collides at ${key}`);
    seen.add(key);
  }
});

/* -------------------------------------------------------------- chemistry */

check('configurations sum to the atomic number', () => {
  for (const el of ELEMENTS) {
    const total = chem.parseConfig(el.cfg).reduce((s, x) => s + x.count, 0);
    equal(total, el.z, `${el.sym} electron total:`);
  }
});

check('no subshell exceeds 2(2l+1) electrons', () => {
  for (const el of ELEMENTS) {
    for (const sub of chem.parseConfig(el.cfg)) {
      assert(sub.count <= chem.capacityOf(sub.l) && sub.count > 0,
        `${el.sym} has ${sub.n}${sub.l}${sub.count}`);
    }
  }
});

check('noble-gas cores expand correctly', () => {
  equal(chem.expandConfig('[Ar] 4s1'), '1s2 2s2 2p6 3s2 3p6 4s1');
  equal(chem.expandConfig('[He] 2s2 2p2'), '1s2 2s2 2p2');
  equal(chem.expandConfig('1s1'), '1s1');
});

check('known aufbau anomalies are preserved', () => {
  const expected = {
    Cr: '[Ar] 3d5 4s1', Cu: '[Ar] 3d10 4s1', Nb: '[Kr] 4d4 5s1', Mo: '[Kr] 4d5 5s1',
    Pd: '[Kr] 4d10', Ag: '[Kr] 4d10 5s1', Pt: '[Xe] 4f14 5d9 6s1', Au: '[Xe] 4f14 5d10 6s1',
    La: '[Xe] 5d1 6s2', Gd: '[Xe] 4f7 5d1 6s2', Cm: '[Rn] 5f7 6d1 7s2', Lr: '[Rn] 5f14 7s2 7p1',
  };
  for (const [sym, cfg] of Object.entries(expected)) equal(BY_SYMBOL[sym].cfg, cfg, `${sym}:`);
});

check('shell populations match the textbook values', () => {
  equal(chem.shellCounts(BY_SYMBOL.Fe), [2, 8, 14, 2]);
  equal(chem.shellCounts(BY_SYMBOL.Na), [2, 8, 1]);
  equal(chem.shellCounts(BY_SYMBOL.U), [2, 8, 18, 32, 21, 9, 2]);
  equal(chem.shellCounts(BY_SYMBOL.Og), [2, 8, 18, 32, 32, 18, 8]);
  for (const el of ELEMENTS) {
    equal(chem.shellCounts(el).reduce((a, b) => a + b, 0), el.z, `${el.sym} shells sum:`);
  }
});

check('main-group valence electrons fall in 1..8 and match the group', () => {
  for (const el of ELEMENTS) {
    if (el.blk !== 's' && el.blk !== 'p') continue;
    const v = chem.valence(el).count;
    assert(v >= 1 && v <= 8, `${el.sym} has ${v} valence electrons`);
  }
  equal(chem.valence(BY_SYMBOL.C).count, 4, 'carbon:');
  equal(chem.valence(BY_SYMBOL.O).count, 6, 'oxygen:');
  equal(chem.valence(BY_SYMBOL.Cl).count, 7, 'chlorine:');
  equal(chem.valence(BY_SYMBOL.Ne).count, 8, 'neon:');
  equal(chem.valence(BY_SYMBOL.He).count, 2, 'helium:');
});

check('the valence shell is the period, not merely the largest occupied n', () => {
  // Palladium's ground state is [Kr] 4d10 with an empty 5s, so the krypton
  // core's 4s/4p must not be mistaken for valence electrons.
  equal(chem.valence(BY_SYMBOL.Pd).count, 0, 'palladium outer s:');
  equal(chem.valence(BY_SYMBOL.Pd).extended, 10, 'palladium with 4d:');
});

check('only f-block elements count an f shell as valence', () => {
  // Platinum's filled 4f is core; its bonding set is 5d9 6s1.
  equal(chem.valence(BY_SYMBOL.Pt).extended, 10, 'platinum:');
  equal(chem.valence(BY_SYMBOL.U).extended, 6, 'uranium:');
  equal(chem.valence(BY_SYMBOL.Zn).extended, 12, 'zinc:');
});

check('Lewis dots pair only after every side is occupied', () => {
  for (const el of ELEMENTS) {
    const { sides, total } = chem.lewisDots(el);
    const counts = Object.values(sides);
    equal(counts.reduce((a, b) => a + b, 0), total, `${el.sym} dot total:`);
    assert(counts.every((c) => c <= 2), `${el.sym} has a side with more than two electrons`);
    // Helium is the one conventional exception: it is drawn as a lone pair
    // rather than two single electrons on opposite sides.
    if (total < 4 && el.z !== 2) {
      assert(counts.every((c) => c <= 1), `${el.sym} paired before all sides were used`);
    }
    assert(total <= 8, `${el.sym} drew ${total} dots`);
  }
  equal(chem.lewisDots(BY_SYMBOL.N).sides, { top: 2, right: 1, bottom: 1, left: 1 }, 'nitrogen:');
  equal(chem.lewisDots(BY_SYMBOL.He).sides, { top: 2, right: 0, bottom: 0, left: 0 }, 'helium lone pair:');
});

check("orbital diagrams obey Hund's rule and the box count", () => {
  for (const el of ELEMENTS) {
    for (const row of chem.orbitalRows(el).rows) {
      equal(row.boxes.length, chem.orbitalCountOf(row.l), `${el.sym} ${row.label} box count:`);
      equal(row.boxes.reduce((a, b) => a + b, 0), row.count, `${el.sym} ${row.label} electrons:`);
      const paired = row.boxes.some((b) => b === 2);
      const empty = row.boxes.some((b) => b === 0);
      assert(!(paired && empty), `${el.sym} ${row.label} pairs before filling singly`);
    }
  }
});

check('orbital rows are listed in aufbau order', () => {
  const labels = chem.orbitalRows(BY_SYMBOL.Fe).rows.map((r) => r.label);
  equal(labels, ['1s', '2s', '2p', '3s', '3p', '4s', '3d'], 'iron:');
});

check('written notation is consistent with the configuration', () => {
  equal(chem.notationShorthand(BY_SYMBOL.Fe), '[Ar] 3d⁶ 4s²');
  equal(chem.notationExpanded(BY_SYMBOL.Ne), '1s² 2s² 2p⁶');
  equal(chem.notationShells(BY_SYMBOL.Fe), '2, 8, 14, 2');
});

/* ----------------------------------------------------------------- fields */

check('missing values resolve to null rather than a printed "null"', () => {
  assert(fields.resolve('en', BY_SYMBOL.Og, DEFAULT_CONFIG) === null, 'oganesson has no electronegativity');
  for (const el of ELEMENTS) {
    for (const id of fields.DETAIL_FIELDS.concat(fields.CORNER_FIELDS.filter((f) => f !== 'none'))) {
      const out = fields.resolve(id, el, DEFAULT_CONFIG);
      if (out === null) continue;
      assert(typeof out.value === 'string' && out.value.length > 0, `${el.sym}/${id} produced ${out.value}`);
      assert(!/null|undefined|NaN/.test(out.value), `${el.sym}/${id} produced "${out.value}"`);
    }
  }
});

check('temperatures convert correctly', () => {
  equal(fields.formatTemp(273.15, 'C'), '0 °C');
  equal(fields.formatTemp(373.15, 'C'), '100 °C');
  equal(fields.formatTemp(273.15, 'F'), '32 °F');
  equal(fields.formatTemp(null, 'K'), null);
});

check('densities are reported per litre for gases', () => {
  assert(fields.FIELDS.density.get(BY_SYMBOL.H).endsWith('g/L'), 'hydrogen should be g/L');
  assert(fields.FIELDS.density.get(BY_SYMBOL.Fe).endsWith('g/cm³'), 'iron should be g/cm³');
});

/* --------------------------------------------------------------- rendering */

/** Minimal well-formedness check: every open tag is closed, in order. */
function assertBalanced(svg, label) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      const open = stack.pop();
      assert(open === name, `${label}: </${name}> closes <${open}>`);
    } else {
      stack.push(name);
    }
  }
  assert(stack.length === 0, `${label}: unclosed <${stack.join('>, <')}>`);
}

check('every element renders in every layout and diagram combination', () => {
  const layouts = Object.keys(LAYOUTS);
  const diagramKinds = Object.keys(DIAGRAMS);
  let count = 0;
  for (const el of ELEMENTS) {
    for (const layout of layouts) {
      for (const diagram of diagramKinds) {
        const svg = renderCard(el, { ...DEFAULT_CONFIG, layout, diagram, fields: fields.DETAIL_FIELDS });
        assert(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${el.sym}/${layout} is not an SVG document`);
        assert(!/NaN|undefined|Infinity/.test(svg), `${el.sym}/${layout}/${diagram} contains a bad value`);
        count++;
      }
    }
  }
  assert(count === 118 * layouts.length * diagramKinds.length, 'combination count');
});

check('rendered markup is well-formed across the style space', () => {
  const layouts = Object.keys(LAYOUTS);
  const themes = Object.keys(THEMES);
  const modes = Object.keys(ACCENT_MODES);
  const palettes = Object.keys(PALETTES);
  ELEMENTS.forEach((el, i) => {
    const cfg = {
      ...DEFAULT_CONFIG,
      layout: layouts[i % layouts.length],
      theme: themes[i % themes.length],
      accentMode: modes[i % modes.length],
      palette: palettes[i % palettes.length],
      diagram: Object.keys(DIAGRAMS)[i % 5],
      displayFont: FONTS[i % FONTS.length].id,
      bodyFont: FONTS[(i * 3) % FONTS.length].id,
      shadow: i % 3 === 0,
      fields: ['category', 'en', 'melt', 'oxidation', 'configShorthand'],
    };
    assertBalanced(renderCard(el, cfg), el.sym);
  });
});

check('attribute values never contain a stray double quote', () => {
  // Font stacks are the usual culprit: a family name in double quotes would
  // terminate the attribute it sits in.
  for (const font of FONTS) assert(!font.stack.includes('"'), `${font.label} stack uses double quotes`);
  const svg = renderCard(BY_SYMBOL.Fe, { ...DEFAULT_CONFIG, displayFont: 'playfair', bodyFont: 'jetbrains' });
  for (const tag of svg.match(/<[a-zA-Z][^>]*>/g)) {
    const quotes = (tag.match(/"/g) || []).length;
    assert(quotes % 2 === 0, `unbalanced quotes in ${tag.slice(0, 80)}`);
  }
});

check('unicode superscripts become raised tspans', () => {
  const svg = renderCard(BY_SYMBOL.Fe, { ...DEFAULT_CONFIG, fields: ['configShorthand'] });
  assert(!/[⁰¹²³⁴-⁹⁺⁻…]/.test(svg),
    'raw superscript or ellipsis characters survived into the markup');
  assert(/<tspan dy="-[\d.]+" font-size="[\d.]+">\d<\/tspan>/.test(svg), 'no raised tspan was emitted');
});

check('presets all produce renderable configurations', () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    const svg = renderCard(BY_Z[26], { ...DEFAULT_CONFIG, ...preset.cfg });
    assert(svg.startsWith('<svg'), `${id} did not render`);
    assertBalanced(svg, `preset ${id}`);
  }
});

check('contact sheets are sized from the card grid', () => {
  const cfg = { ...DEFAULT_CONFIG, width: 200, height: 300 };
  const svg = renderSheet([1, 2, 3, 4, 5].map((z) => BY_Z[z]), cfg, { columns: 3, gap: 10 });
  assert(svg.includes('width="620"'), `expected width 620, got ${svg.slice(0, 120)}`);
  assert(svg.includes('height="610"'), `expected height 610, got ${svg.slice(0, 120)}`);
  assertBalanced(svg, 'sheet');
});

check('diagram generators return positive dimensions for every element', () => {
  for (const el of ELEMENTS) {
    for (const kind of ['lewis', 'shell', 'orbital', 'orbitalValence']) {
      const d = diagrams.build(kind, el, { ink: '#000', accent: '#c00', muted: '#888', font: 'sans-serif' });
      assert(d && d.w > 0 && d.h > 0, `${el.sym}/${kind} produced ${d && `${d.w}x${d.h}`}`);
      assert(!/NaN|undefined/.test(d.body), `${el.sym}/${kind} body contains a bad value`);
    }
  }
  assert(diagrams.build('none', BY_SYMBOL.C, {}) === null, 'the "none" diagram should be null');
});

check('markup-unsafe characters in data would be escaped', () => {
  equal(diagrams.esc('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
});

/* ------------------------------------------------------------------ report */

console.log(`\n${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
