import { normalizeOutput } from './normalize.js';

// Intentionally naive: exact or reversed password after stripping non-letters.
// Encodings, translations, acrostics etc. are expected to get through.
export function checkOutput(reply, password) {
  const text = normalizeOutput(reply);
  const pw = normalizeOutput(password);
  const reversed = [...pw].reverse().join('');
  return { blocked: text.includes(pw) || text.includes(reversed) };
}
