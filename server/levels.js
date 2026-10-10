// Defenses stack: each level = previous level + one new defense.
// systemPrompt refers to a key in SYSTEM_PROMPTS (prompts.js).

export const LEVELS = [
  {
    level: 1,
    systemPrompt: 'baseline',
    inputFilter: false,
    outputCheck: false,
    judge: false,
    greeting: "Welcome, traveler! I am Dwarpal. I guard a password, but I'm in a chatty mood today.",
  },
  {
    level: 2,
    systemPrompt: 'protected',
    inputFilter: false,
    outputCheck: false,
    judge: false,
    greeting: 'I have been given strict orders this time. My lips are sealed.',
  },
  {
    level: 3,
    systemPrompt: 'protected',
    inputFilter: true,
    outputCheck: false,
    judge: false,
    greeting: "I've learned to listen for forbidden words. Choose yours carefully.",
  },
  {
    level: 4,
    systemPrompt: 'protected',
    inputFilter: true,
    outputCheck: true,
    judge: false,
    greeting: 'Now I check my own words before I speak them.',
  },
  {
    level: 5,
    systemPrompt: 'protected',
    inputFilter: true,
    outputCheck: true,
    judge: true,
    greeting: 'A watcher now reads every reply before it leaves my lips. Even clever tricks are noticed.',
  },
];

export const MAX_LEVEL = LEVELS.length;

export function getLevel(level) {
  const cfg = LEVELS.find((l) => l.level === level);
  if (!cfg) throw new Error(`Unknown level: ${level}`);
  return cfg;
}
