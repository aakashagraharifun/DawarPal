import { LEET_MAP } from './filterConfig.js';

// Input filter: lowercase → leet map → keep only a–z.
export function normalizeInput(text) {
  return [...String(text).toLowerCase()]
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
}

// Output check: lowercase → keep only a–z. Deliberately no leet mapping.
export function normalizeOutput(text) {
  return String(text).toLowerCase().replace(/[^a-z]/g, '');
}
