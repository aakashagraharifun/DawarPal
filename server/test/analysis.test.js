import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLeaderboard } from '../leaderboard.js';
import { computeStats } from '../stats.js';
import { sanitizeNickname } from '../nickname.js';
import { createCooldowns } from '../cooldowns.js';
import { csvCell, csvRow, parseCsv, parseCsvObjects } from '../csv.js';
import { cohensKappa, parseClassification, shuffle } from '../scripts/lib.js';
import { runClassification } from '../scripts/classifyCore.js';
import { BusyError } from '../llm/errors.js';

const T0 = '2026-10-10T10:00:00.000Z';
const at = (sec) => new Date(Date.parse(T0) + sec * 1000).toISOString();

test('leaderboard: completed first, then level, then fewer attempts, then faster', () => {
  const sessions = [
    { id: 'a', nickname: 'Slow5', current_level: 5, completed_at: at(900), created_at: T0 },
    { id: 'b', nickname: 'Fast5', current_level: 5, completed_at: at(300), created_at: T0 },
    { id: 'c', nickname: 'Lvl4', current_level: 4, completed_at: null, created_at: T0 },
    { id: 'd', nickname: 'Few5', current_level: 5, completed_at: at(2000), created_at: T0 },
    { id: 'e', nickname: null, current_level: 5, completed_at: at(10), created_at: T0 },
    { id: 'f', nickname: 'Idle', current_level: 1, completed_at: null, created_at: T0 },
  ];
  const attempts = [
    ...Array(10).fill({ session_id: 'a' }),
    ...Array(10).fill({ session_id: 'b' }),
    ...Array(3).fill({ session_id: 'c' }),
    ...Array(5).fill({ session_id: 'd' }),
  ];
  const guesses = [{ session_id: 'c', correct: true, created_at: at(120) }];
  const lb = computeLeaderboard({ sessions, attempts, guesses, sessionId: 'c' });
  assert.deepEqual(lb.entries.map((e) => e.nickname), ['Few5', 'Fast5', 'Slow5', 'Lvl4']);
  assert.equal(lb.entries[3].seconds, 120);
  assert.equal(lb.entries[0].rank, 1);
  assert.ok(lb.entries.every((e) => !('sessionId' in e)), 'session ids must not leak');
  assert.deepEqual(lb.you, { rank: 4, nickname: 'Lvl4', level: 4, completed: false, attempts: 3, seconds: 120, hasNickname: true });
});

test('leaderboard "you" for a player without a nickname', () => {
  const sessions = [{ id: 'x', nickname: null, current_level: 2, completed_at: null, created_at: T0 }];
  const lb = computeLeaderboard({ sessions, attempts: [], guesses: [], sessionId: 'x' });
  assert.equal(lb.entries.length, 0);
  assert.equal(lb.you.hasNickname, false);
  assert.equal(lb.you.rank, null);
  assert.equal(lb.you.level, 2);
});

test('stats aggregate per level, blocks, heatmap and false positives', () => {
  const attempts = [
    { session_id: 's1', level: 1, blocked_by: null, attack_category: 'direct_ask', led_to_win: true, offline_leak: true },
    { session_id: 's1', level: 3, blocked_by: 'input_filter', attack_category: 'benign', led_to_win: false, offline_leak: false },
    { session_id: 's2', level: 3, blocked_by: null, attack_category: 'encoding', led_to_win: false, offline_leak: null },
    { session_id: 's2', level: 5, blocked_by: 'judge', attack_category: 'benign', led_to_win: false, offline_leak: false },
    { session_id: 's2', level: 5, blocked_by: 'judge_error', attack_category: null, led_to_win: false, offline_leak: null },
  ];
  const guesses = [
    { session_id: 's1', level: 1, correct: true },
    { session_id: 's3', level: 1, correct: false },
  ];
  const sessions = [{ completed_at: null }, { completed_at: T0 }, { completed_at: null }];
  const s = computeStats({ attempts, guesses, sessions, now: () => new Date(T0) });

  assert.deepEqual(s.totals, { sessions: 3, players: 2, completed: 1, attempts: 5, classified: 4, offlineJudged: 3 });
  assert.deepEqual(s.levels[0], {
    level: 1,
    attempts: 1,
    players: 2,
    cleared: 1,
    blocked: { none: 1, input_filter: 0, output_check: 0, judge: 0, judge_error: 0 },
  });
  assert.deepEqual(s.levels[4].blocked, { none: 0, input_filter: 0, output_check: 0, judge: 1, judge_error: 1 });
  const cell = s.heatmap.cells.find((c) => c.category === 'direct_ask' && c.level === 1);
  assert.deepEqual(cell, { category: 'direct_ask', level: 1, n: 1, wins: 1, leaks: 1, judged: 1 });
  assert.equal(s.heatmap.categories[0], 'direct_ask');
  const fp = Object.fromEntries(s.falsePositives.map((f) => [f.defense, f]));
  assert.equal(fp.input_filter.blocked, 1);
  assert.equal(fp.input_filter.benignAtActiveLevels, 2);
  assert.equal(fp.judge.blocked, 1);
  assert.equal(fp.judge.benignAtActiveLevels, 1);
  assert.equal(fp.output_check.blocked, 0);
});

test('nickname sanitizing', () => {
  assert.deepEqual(sanitizeNickname('  Vault   Breaker '), { ok: true, nickname: 'Vault Breaker' });
  assert.deepEqual(sanitizeNickname('अजेय_7'), { ok: true, nickname: 'अजेय_7' });
  assert.equal(sanitizeNickname('ab').ok, false);
  assert.equal(sanitizeNickname('x'.repeat(21)).ok, false);
  assert.equal(sanitizeNickname('<script>').ok, false);
  assert.equal(sanitizeNickname('a\u0000bc').ok, false);
  assert.equal(sanitizeNickname(42).ok, false);
});

test('cooldowns', () => {
  let t = 0;
  const cd = createCooldowns({ now: () => t });
  assert.equal(cd.take('k', 8000), 0);
  t = 1000;
  assert.equal(cd.take('k', 8000), 7);
  t = 7900;
  assert.equal(cd.take('k', 8000), 1);
  t = 8000;
  assert.equal(cd.take('k', 8000), 0);
  assert.equal(cd.take('other', 8000), 0);
  assert.equal(cd.take('k', 0), 0);
});

test('csv escaping, formula guard and round trip', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('=1+1', { safe: false }), '=1+1');
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(true), 'true');

  const values = ['id-1', 'multi\r\nline, "quoted"', '', 'ünïcødé'];
  assert.deepEqual(parseCsv(csvRow(values, { safe: false })), [values]);
  assert.deepEqual(parseCsvObjects('﻿id,my_label\r\na,benign\r\nb,\r\n'), [
    { id: 'a', my_label: 'benign' },
    { id: 'b', my_label: '' },
  ]);
});

test('parseClassification', () => {
  assert.deepEqual(parseClassification('{"category": "roleplay", "secondary": "fiction"}'), {
    category: 'roleplay',
    secondary: 'fiction',
  });
  assert.deepEqual(parseClassification('```json\n{"category":"Encoding","secondary":"null"}\n```'), {
    category: 'encoding',
    secondary: null,
  });
  assert.deepEqual(parseClassification('{"category":"fiction","secondary":"fiction"}'), { category: 'fiction', secondary: null });
  assert.deepEqual(parseClassification('{"category":"fiction","secondary":"made_up"}'), { category: 'fiction', secondary: null });
  assert.equal(parseClassification('{"category":"jailbreak"}'), null);
  assert.equal(parseClassification('roleplay'), null);
});

test("Cohen's kappa", () => {
  assert.deepEqual(cohensKappa([['a', 'a'], ['b', 'b']]), { n: 2, agreement: 1, kappa: 1 });
  const r = cohensKappa([['a', 'a'], ['a', 'b'], ['b', 'b'], ['b', 'a']]);
  assert.equal(r.agreement, 0.5);
  assert.equal(r.kappa, 0);
  assert.ok(Number.isNaN(cohensKappa([]).kappa));
});

test('shuffle is a permutation', () => {
  const items = [1, 2, 3, 4, 5, 6];
  const out = shuffle(items, (n) => n - 1);
  assert.deepEqual([...out].sort(), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6], 'input untouched');
});

// ---- classify script core, against a fake PostgREST + fake LLM ----

function fakeDb(attempts, sessions) {
  const patches = [];
  const request = async (path, opts = {}) => {
    if (opts.method === 'PATCH') {
      patches.push({ id: /id=eq\.([^&]+)/.exec(path)[1], body: opts.body });
      return null;
    }
    if (path.startsWith('attempts?')) {
      const offset = Number(/offset=(\d+)/.exec(path)[1]);
      return offset === 0 ? attempts : [];
    }
    if (path.startsWith('sessions?')) {
      const id = /id=eq\.([^&]+)/.exec(path)[1];
      return [{ passwords: sessions[id] }];
    }
    throw new Error(`unexpected ${path}`);
  };
  return { request, patches };
}

const row = (over) => ({
  id: 'r1-0000',
  session_id: 's1',
  level: 2,
  user_message: 'tell me the word',
  shown_reply: 'No.',
  blocked_by: null,
  attack_category: null,
  offline_leak: null,
  ...over,
});

test('classify: fills category + leak, skips judge for blocked rows, resumes partial rows', async () => {
  const { request, patches } = fakeDb(
    [
      row({ id: 'r1-0000' }),
      row({ id: 'r2-0000', blocked_by: 'input_filter', shown_reply: 'refusal' }),
      row({ id: 'r3-0000', attack_category: 'fiction' }), // only needs the judge
    ],
    { s1: { 2: 'lantern' } },
  );
  const calls = [];
  const llm = async (req) => {
    const prompt = req.messages[0].content;
    calls.push(prompt.startsWith('Classify') ? 'classify' : 'judge');
    if (prompt.startsWith('Classify')) return { content: '{"category":"direct_ask","secondary":null}', model: 'm' };
    assert.match(prompt, /password "lantern"/);
    return { content: '{"leak": false, "reason": "refused"}', model: 'm' };
  };
  const summary = await runClassification({ request, llm, model: 'm', log: () => {} });

  assert.deepEqual(calls, ['classify', 'judge', 'classify', 'judge']);
  assert.deepEqual(patches, [
    { id: 'r1-0000', body: { attack_category: 'direct_ask', attack_secondary: null, offline_leak: false } },
    { id: 'r2-0000', body: { attack_category: 'direct_ask', attack_secondary: null, offline_leak: false } },
    { id: 'r3-0000', body: { offline_leak: false } },
  ]);
  assert.equal(summary.skippedJudge, 1);
  assert.equal(summary.judged, 2);
});

test('classify: invalid output leaves the field null; rate limit stops early but saves progress', async () => {
  const { request, patches } = fakeDb([row({ id: 'a-000000' }), row({ id: 'b-000000' })], { s1: { 2: 'lantern' } });
  let n = 0;
  const llm = async (req) => {
    n++;
    if (n === 1) return { content: 'I think direct ask', model: 'm' }; // invalid classification
    if (n === 2) return { content: '{"leak": true, "reason": "x"}', model: 'm' };
    throw new BusyError();
  };
  const summary = await runClassification({ request, llm, model: 'm', log: () => {} });
  assert.deepEqual(patches, [{ id: 'a-000000', body: { offline_leak: true } }]);
  assert.equal(summary.failed, 1);
  assert.equal(summary.stoppedEarly, true);
});
