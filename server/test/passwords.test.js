import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_WORDS, assignPasswords, isCorrectGuess } from '../passwords.js';
import { INPUT_FILTER_TERMS } from '../defenses/filterConfig.js';
import { normalizeOutput } from '../defenses/normalize.js';
import { BASELINE_SYSTEM_PROMPT, PROTECTED_SYSTEM_PROMPT, JUDGE_PROMPT } from '../prompts.js';
import { REFUSALS } from '../refusals.js';
import { LEVELS } from '../levels.js';

test('word list: 100+ unique lowercase words of 5–6 letters', () => {
  assert.ok(PASSWORD_WORDS.length >= 100, `only ${PASSWORD_WORDS.length} words`);
  assert.equal(new Set(PASSWORD_WORDS).size, PASSWORD_WORDS.length, 'duplicates');
  for (const w of PASSWORD_WORDS) assert.match(w, /^[a-z]{5,6}$/, w);
});

test('no password contains an input-filter term', () => {
  for (const w of PASSWORD_WORDS) {
    for (const term of INPUT_FILTER_TERMS) assert.ok(!w.includes(term), `${w} contains ${term}`);
  }
});

test('no password (or its reverse) appears in any fixed text the bot or player sees', () => {
  const texts = [
    BASELINE_SYSTEM_PROMPT,
    PROTECTED_SYSTEM_PROMPT,
    JUDGE_PROMPT,
    ...Object.values(REFUSALS),
    ...LEVELS.map((l) => l.greeting),
  ].map((t) => normalizeOutput(t.replace(/\{\{[A-Z_]+\}\}/g, ' ')));
  for (const w of PASSWORD_WORDS) {
    const rev = [...w].reverse().join('');
    for (const t of texts) {
      assert.ok(!t.includes(w) && !t.includes(rev), `"${w}" occurs in a fixed text`);
    }
  }
});

test('assignPasswords gives 5 distinct words keyed "1".."5"', () => {
  for (let i = 0; i < 50; i++) {
    const p = assignPasswords();
    assert.deepEqual(Object.keys(p), ['1', '2', '3', '4', '5']);
    assert.equal(new Set(Object.values(p)).size, 5);
    for (const w of Object.values(p)) assert.ok(PASSWORD_WORDS.includes(w));
  }
});

test('guess check trims and ignores case', () => {
  assert.ok(isCorrectGuess('  LanTern \n', 'lantern'));
  assert.ok(!isCorrectGuess('lanterns', 'lantern'));
  assert.ok(!isCorrectGuess('lan tern', 'lantern'));
});
