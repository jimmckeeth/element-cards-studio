/**
 * fields.js — every property a card can display, with its formatter.
 *
 * Each field returns a `{ label, value }` pair, or null when the element has no
 * value for it, so layouts can simply skip missing data rather than printing
 * blanks (many superheavy elements have no measured electronegativity, for
 * instance).
 */

import { CATEGORIES } from './elements.js';
import * as chem from './chem.js';

const GROUP_NAMES = {
  1: 'Group 1 · alkali metals', 2: 'Group 2 · alkaline earth metals',
  17: 'Group 17 · halogens', 18: 'Group 18 · noble gases',
};

export function formatTemp(kelvin, unit) {
  if (kelvin == null) return null;
  if (unit === 'C') return `${round(kelvin - 273.15)} °C`;
  if (unit === 'F') return `${round((kelvin - 273.15) * 9 / 5 + 32)} °F`;
  return `${round(kelvin)} K`;
}

function round(n) {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
  return Number(n.toFixed(digits)).toString();
}

export function elementName(el, cfg) {
  const name = cfg.usSpelling && el.alt ? el.alt : el.name;
  return cfg.uppercaseName ? name.toUpperCase() : name;
}

/** Atomic weight, bracketed for elements with no stable isotope. */
export function formatMass(el) {
  return el.synth ? `[${el.mass}]` : String(el.mass);
}

export function formatOxidation(el) {
  if (!el.ox?.length) return null;
  return el.ox.map((o) => (o > 0 ? `+${o}` : String(o))).join(', ');
}

export function formatDensity(el) {
  if (el.dens == null) return null;
  return el.phase === 'gas' ? `${round(el.dens * 1000)} g/L` : `${round(el.dens)} g/cm³`;
}

export const FIELDS = {
  z:               { label: 'Atomic number',     short: 'Z',        get: (el) => String(el.z) },
  symbol:          { label: 'Symbol',            short: 'Symbol',   get: (el) => el.sym },
  name:            { label: 'Name',              short: 'Name',     get: (el, c) => elementName(el, c) },
  mass:            { label: 'Atomic weight',     short: 'Mass',     get: (el) => formatMass(el) },
  category:        { label: 'Category',          short: 'Category', get: (el) => CATEGORIES[el.cat].label },
  groupName:       { label: 'Group name',        short: 'Family',   get: (el) => GROUP_NAMES[el.grp] ?? null },
  group:           { label: 'Group',             short: 'Group',    get: (el) => (el.grp ? String(el.grp) : null) },
  period:          { label: 'Period',            short: 'Period',   get: (el) => String(el.per) },
  block:           { label: 'Block',             short: 'Block',    get: (el) => `${el.blk}-block` },
  gp:              { label: 'Group / period',    short: 'Grp/Per',  get: (el) => (el.grp ? `${el.grp} · ${el.per}` : `f · ${el.per}`) },
  phase:           { label: 'State at 20 °C',    short: 'State',    get: (el) => el.phase.charAt(0).toUpperCase() + el.phase.slice(1) },
  en:              { label: 'Electronegativity', short: 'EN',       get: (el) => (el.en == null ? null : el.en.toFixed(2)) },
  melt:            { label: 'Melting point',     short: 'Melts',    get: (el, c) => formatTemp(el.melt, c.tempUnit) },
  boil:            { label: 'Boiling point',     short: 'Boils',    get: (el, c) => formatTemp(el.boil, c.tempUnit) },
  density:         { label: 'Density',           short: 'Density',  get: (el) => formatDensity(el) },
  ie:              { label: 'Ionisation energy', short: '1st IE',  get: (el) => (el.ie == null ? null : `${el.ie.toFixed(2)} eV`) },
  radius:          { label: 'Atomic radius',     short: 'Radius',   get: (el) => (el.rad == null ? null : `${el.rad} pm`) },
  oxidation:       { label: 'Oxidation states',  short: 'Ox.',      get: (el) => formatOxidation(el) },
  discovered:      { label: 'Discovered',        short: 'Found',    get: (el) => (el.disc === 'ancient' ? 'Antiquity' : String(el.disc)) },
  valence:         { label: 'Valence electrons', short: 'Valence',  get: (el) => String(chem.valence(el).count) },
  shells:          { label: 'Electrons per shell', short: 'Shells', get: (el) => chem.notationShells(el) },
  configShorthand: { label: 'Electron configuration', short: 'Config', get: (el) => chem.notationShorthand(el) },
  configFull:      { label: 'Configuration (full)',  short: 'Config', get: (el) => chem.notationExpanded(el) },
  configAufbau:    { label: 'Configuration (aufbau order)', short: 'Config', get: (el) => chem.notationFull(el) },
};

/** Fields offered for the small corner slots — short values only. */
export const CORNER_FIELDS = [
  'none', 'z', 'mass', 'category', 'phase', 'en', 'gp', 'group', 'period',
  'block', 'valence', 'shells', 'oxidation', 'radius', 'ie', 'density', 'discovered',
];

/** Fields offered for the stacked detail list. */
export const DETAIL_FIELDS = [
  'name', 'mass', 'category', 'groupName', 'gp', 'block', 'phase', 'en', 'melt', 'boil',
  'density', 'ie', 'radius', 'oxidation', 'valence', 'discovered', 'shells',
  'configShorthand', 'configFull', 'configAufbau',
];

/** Resolve a field id to `{ label, short, value }`, or null when unavailable. */
export function resolve(id, el, cfg) {
  const f = FIELDS[id];
  if (!f) return null;
  const value = f.get(el, cfg);
  return value == null ? null : { id, label: f.label, short: f.short, value };
}
