import { ATTACK_CATEGORIES } from './categories.js';
import { MAX_LEVEL } from './levels.js';

export const BLOCK_KEYS = ['none', 'input_filter', 'output_check', 'judge', 'judge_error'];

// Which level each blocking stage first appears on (for false-positive denominators).
const DEFENSE_FROM_LEVEL = { input_filter: 3, output_check: 4, judge: 5, judge_error: 5 };

// Aggregated, anonymized numbers for the public results dashboard. No message text,
// no session ids, no nicknames.
//
// attempts: [{ session_id, level, blocked_by, attack_category, led_to_win, offline_leak }]
// guesses:  [{ session_id, level, correct }]
// sessions: [{ completed_at }]
export function computeStats({ attempts, guesses, sessions, now = () => new Date() }) {
  const levelNums = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

  const levels = levelNums.map((level) => {
    const here = attempts.filter((a) => a.level === level);
    const guessesHere = guesses.filter((g) => g.level === level);
    const blocked = Object.fromEntries(BLOCK_KEYS.map((k) => [k, 0]));
    for (const a of here) blocked[a.blocked_by ?? 'none'] += 1;
    return {
      level,
      attempts: here.length,
      players: new Set([...here.map((a) => a.session_id), ...guessesHere.map((g) => g.session_id)]).size,
      cleared: new Set(guessesHere.filter((g) => g.correct).map((g) => g.session_id)).size,
      blocked,
    };
  });

  const cells = new Map();
  for (const a of attempts) {
    if (!a.attack_category) continue;
    const key = `${a.attack_category}|${a.level}`;
    const cell = cells.get(key) ?? { category: a.attack_category, level: a.level, n: 0, wins: 0, leaks: 0, judged: 0 };
    cell.n += 1;
    if (a.led_to_win) cell.wins += 1;
    if (a.offline_leak !== null && a.offline_leak !== undefined) {
      cell.judged += 1;
      if (a.offline_leak) cell.leaks += 1;
    }
    cells.set(key, cell);
  }
  const seen = new Set([...cells.values()].map((c) => c.category));
  const categories = [...ATTACK_CATEGORIES, ...[...seen].filter((c) => !ATTACK_CATEGORIES.includes(c)).sort()];

  const benign = attempts.filter((a) => a.attack_category === 'benign');
  const falsePositives = Object.entries(DEFENSE_FROM_LEVEL).map(([defense, fromLevel]) => ({
    defense,
    fromLevel,
    blocked: benign.filter((a) => a.blocked_by === defense).length,
    benignAtActiveLevels: benign.filter((a) => a.level >= fromLevel).length,
  }));

  return {
    generatedAt: now().toISOString(),
    totals: {
      sessions: sessions.length,
      players: new Set(attempts.map((a) => a.session_id)).size,
      completed: sessions.filter((s) => s.completed_at).length,
      attempts: attempts.length,
      classified: attempts.filter((a) => a.attack_category).length,
      offlineJudged: attempts.filter((a) => a.offline_leak !== null && a.offline_leak !== undefined).length,
    },
    levels,
    heatmap: { categories, cells: [...cells.values()] },
    falsePositives,
  };
}
