import { INPUT_FILTER_TERMS } from './filterConfig.js';
import { normalizeInput } from './normalize.js';

export function checkInput(message) {
  const normalized = normalizeInput(message);
  const term = INPUT_FILTER_TERMS.find((t) => normalized.includes(t)) ?? null;
  return { blocked: term !== null, term };
}
