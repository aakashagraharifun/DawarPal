// Nickname rules: 3–20 characters of letters (any script, incl. combining marks such as
// Devanagari vowel signs), digits, space, _ . -
// Normalized (NFKC), trimmed and inner whitespace collapsed before checking.
const ALLOWED = /^[\p{L}\p{M}\p{N} _.-]+$/u;

export function sanitizeNickname(input) {
  if (typeof input !== 'string') return { ok: false, error: 'Nickname is required.' };
  const nickname = input.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (nickname.length < 3 || nickname.length > 20) {
    return { ok: false, error: 'Nickname must be 3–20 characters.' };
  }
  if (!ALLOWED.test(nickname)) {
    return { ok: false, error: 'Use only letters, numbers, spaces, and _ . -' };
  }
  return { ok: true, nickname };
}
