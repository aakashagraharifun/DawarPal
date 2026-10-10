import { randomInt } from 'node:crypto';
import { MAX_LEVEL } from './levels.js';

// Common, concrete English nouns, 5–6 letters, no proper nouns.
// Excluded on purpose (enforced by test/passwords.test.js):
//   - any input-filter term, and any word that appears in the prompts, refusals or
//     greetings (e.g. "ancient", "vault"), so normal replies can't trip the output check;
//   - words that easily form across word boundaries once spaces are stripped
//     (e.g. "forest" in "for establishing", "island" in "is landing", "comet" in "come to").
export const PASSWORD_WORDS = [
  // 5 letters
  'bagel', 'daisy', 'honey', 'igloo', 'llama', 'quilt', 'scarf', 'tiger', 'tulip', 'zebra',
  // 6 letters
  'almond', 'anchor', 'badger', 'ballet', 'bamboo', 'banana', 'barrel', 'basket', 'bottle',
  'bridge', 'bubble', 'bucket', 'buckle', 'butter', 'cactus', 'camera', 'candle', 'canyon',
  'carpet', 'carrot', 'castle', 'celery', 'cereal', 'cherry', 'circus', 'cobweb', 'cookie',
  'copper', 'crayon', 'dagger', 'donkey', 'dragon', 'engine', 'falcon', 'ferret', 'fiddle',
  'fossil', 'galaxy', 'garden', 'garlic', 'ginger', 'goblet', 'gravel', 'guitar', 'hammer',
  'harbor', 'helmet', 'jacket', 'jungle', 'kettle', 'kitten', 'ladder', 'lagoon', 'lizard',
  'magnet', 'marble', 'meadow', 'meteor', 'mirror', 'mitten', 'monkey', 'muffin', 'napkin',
  'needle', 'noodle', 'nugget', 'nutmeg', 'orchid', 'oyster', 'paddle', 'palace', 'papaya',
  'parrot', 'peanut', 'pebble', 'pencil', 'pepper', 'pickle', 'pillow', 'pirate', 'planet',
  'pocket', 'potato', 'puffin', 'puzzle', 'rabbit', 'radish', 'raisin', 'ribbon', 'rocket',
  'saddle', 'salmon', 'sandal', 'shovel', 'spider', 'sponge', 'statue', 'teapot', 'toffee',
  'tomato', 'tunnel', 'turnip', 'turtle', 'velvet', 'violin', 'waffle', 'walnut', 'walrus',
  'window', 'wizard', 'yogurt',
];

// One distinct password per level, keyed "1".."5" (stored as jsonb).
export function assignPasswords(pick = randomInt) {
  const pool = [...PASSWORD_WORDS];
  const out = {};
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const [word] = pool.splice(pick(pool.length), 1);
    out[String(level)] = word;
  }
  return out;
}

export function isCorrectGuess(guess, password) {
  return String(guess).trim().toLowerCase() === String(password).trim().toLowerCase();
}
