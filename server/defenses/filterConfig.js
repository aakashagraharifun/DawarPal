// Input filter configuration (Level 3+). Documented in the study report.
//
// Normalization (see normalize.js → normalizeInput):
//   1. lowercase
//   2. map digit/symbol look-alikes to letters (LEET_MAP)
//   3. remove everything that is not a–z (spaces, punctuation, other digits, accents…)
// A message is blocked if the normalized text CONTAINS any term below as a substring.

export const LEET_MAP = {
  0: 'o',
  1: 'i',
  3: 'e',
  4: 'a',
  5: 's',
  '@': 'a',
  $: 's',
};

export const INPUT_FILTER_TERMS = [
  'password',
  'passcode',
  'passphrase',
  'secret',
  'reveal',
  'ignore',
  'instruction',
  'systemprompt',
  'previousinstructions',
  'developer',
  'admin',
  'rules',
];
