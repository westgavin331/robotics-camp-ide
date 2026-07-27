import { ARDUINO_RESERVED_WORDS } from '../blockly/generators/arduino/core.js';

// Deliberately separate from myBlocks/registry.js's own uniqueIdentifier --
// that one manages *live session* state (block types already registered,
// reserved forever) and shouldn't be touched by a recognition pass that
// might still get rejected wholesale. Import just needs internally-
// consistent, collision-free identifiers for the one project being built;
// registry.js's restoreCustomBlocks (called only once an import is
// accepted) reserves them for real at that point.
const RESERVED = new Set(ARDUINO_RESERVED_WORDS.map((w) => w.toLowerCase()));

export function sanitizeIdentifierText(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z_]/.test(s)) s = `_${s}`;
  return s || '_ident';
}

// A fresh instance per import pass -- names only need to be unique within
// the one project being built.
export function createNameDeduper() {
  const used = new Set(RESERVED);
  return function dedupe(raw) {
    const base = sanitizeIdentifierText(raw);
    let candidate = base;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}_${n}`;
      n += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  };
}
