// HTTP tests for Phase 4/5 endpoints: cooldowns, nickname, leaderboard, stats, export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { createMemoryStore } from '../store/memoryStore.js';
import { createCooldowns } from '../cooldowns.js';
import { createFakeLlm } from './fakeLlm.js';

const ADMIN = 'test-admin-token';
let server;
let base;
let store;
let clock = 0;
let releaseBot = null;

before(async () => {
  store = createMemoryStore();
  const llm = createFakeLlm({
    bot: (msg) =>
      msg === 'slow'
        ? new Promise((resolve) => {
            releaseBot = () => resolve('done');
          })
        : msg === 'formula'
          ? '=HYPERLINK("http://evil")'
          : 'Greetings.',
  });
  const app = createApp({
    store,
    llm,
    config: {
      clientOrigin: '*',
      botModel: 'b',
      judgeModel: 'j',
      llm: { timeoutMs: 1000 },
      cooldowns: { chatMs: 8000, guessMs: 5000 },
      adminToken: ADMIN,
    },
    logError: () => {},
    cooldowns: createCooldowns({ now: () => clock }),
  });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // CSV
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

const newSession = async () => (await call('POST', '/session')).body.sessionId;

test('/levels advertises cooldowns', async () => {
  const { body } = await call('GET', '/levels');
  assert.deepEqual(body.cooldowns, { chatMs: 8000, guessMs: 5000 });
});

test('chat cooldown: 1 message per 8s per session', async () => {
  const s = await newSession();
  clock = 100_000;
  assert.equal((await call('POST', '/chat', { sessionId: s, message: 'hi' })).status, 200);
  clock += 3000;
  const tooSoon = await call('POST', '/chat', { sessionId: s, message: 'hi' });
  assert.equal(tooSoon.status, 429);
  assert.equal(tooSoon.body.retryAfter, 5);
  assert.equal(tooSoon.headers.get('retry-after'), '5');
  const other = await newSession();
  assert.equal((await call('POST', '/chat', { sessionId: other, message: 'hi' })).status, 200, 'per session');
  clock += 5000;
  assert.equal((await call('POST', '/chat', { sessionId: s, message: 'hi' })).status, 200);
  // Rejected requests are not logged as attempts.
  assert.equal(store._attempts.filter((a) => a.session_id === s).length, 2);
});

test('guess cooldown: 1 guess per 5s per session', async () => {
  const s = await newSession();
  clock = 200_000;
  assert.equal((await call('POST', '/guess', { sessionId: s, guess: 'nope' })).status, 200);
  clock += 1000;
  const r = await call('POST', '/guess', { sessionId: s, guess: 'nope' });
  assert.equal(r.status, 429);
  assert.equal(r.body.retryAfter, 4);
  assert.equal(store._guesses.filter((g) => g.session_id === s).length, 1);
});

test('a second chat while one is in flight is refused', async () => {
  const s = await newSession();
  clock = 300_000;
  const first = call('POST', '/chat', { sessionId: s, message: 'slow' });
  while (!releaseBot) await new Promise((r) => setTimeout(r, 5));
  clock += 60_000; // cooldown passed, but still answering
  const second = await call('POST', '/chat', { sessionId: s, message: 'hi' });
  assert.equal(second.status, 429);
  releaseBot();
  releaseBot = null;
  assert.equal((await first).status, 200);
});

test('nickname + leaderboard', async () => {
  const s = await newSession();
  clock = 400_000;
  assert.equal((await call('POST', '/nickname', { sessionId: s, nickname: 'x' })).status, 400);
  const ok = await call('POST', '/nickname', { sessionId: s, nickname: '  Gate   Crasher ' });
  assert.deepEqual(ok.body, { nickname: 'Gate Crasher' });

  // Not listed until they've made progress.
  let lb = await call('GET', `/leaderboard?sessionId=${s}`);
  assert.ok(!lb.body.entries.some((e) => e.nickname === 'Gate Crasher'));
  assert.equal(lb.body.you.hasNickname, true);

  await call('POST', '/chat', { sessionId: s, message: 'hi' });
  const pw = (await store.getSession(s)).passwords['1'];
  await call('POST', '/guess', { sessionId: s, guess: pw });
  lb = await call('GET', `/leaderboard?sessionId=${s}`);
  const mine = lb.body.entries.find((e) => e.nickname === 'Gate Crasher');
  assert.equal(mine.level, 2);
  assert.equal(mine.attempts, 1);
  assert.equal(lb.body.you.rank, mine.rank);
  assert.ok(!lb.text.includes(s), 'session id must not appear');
  assert.ok(!lb.text.includes(pw), 'password must not appear');
});

test('/stats is aggregated: no message text, ids, nicknames or passwords', async () => {
  const s = await newSession();
  clock = 500_000;
  await call('POST', '/chat', { sessionId: s, message: 'UNIQUE-MARKER-MESSAGE' });
  await call('POST', '/nickname', { sessionId: s, nickname: 'StatsHider' });
  const { status, text, body } = await call('GET', '/stats');
  assert.equal(status, 200);
  assert.equal(body.levels.length, 5);
  assert.ok(!text.includes('UNIQUE-MARKER'));
  assert.ok(!text.includes('StatsHider'));
  assert.ok(!text.includes(s));
  for (const pw of Object.values((await store.getSession(s)).passwords)) assert.ok(!text.includes(pw));
});

test('admin export: token required, CSV correct, formula-safe, never includes passwords', async () => {
  assert.equal((await call('GET', '/admin/export.csv')).status, 401);
  assert.equal((await call('GET', '/admin/export.csv', null, { 'x-admin-token': 'wrong' })).status, 401);

  const s = await newSession();
  clock = 600_000;
  await call('POST', '/chat', { sessionId: s, message: 'formula' });

  const res = await call('GET', '/admin/export.csv', null, { 'x-admin-token': ADMIN });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /dwarpal-attempts-/);
  const [header] = res.text.replace(/^﻿/, '').split('\r\n');
  assert.equal(header.split(',')[0], 'id');
  assert.ok(header.includes('judge_reason'));
  assert.ok(res.text.includes(`"'=HYPERLINK(""http://evil"")"`), 'formula neutralised by default');

  const raw = await call('GET', '/admin/export.csv?raw=1', null, { 'x-admin-token': ADMIN });
  assert.ok(raw.text.startsWith('id,'), 'no BOM in raw mode');
  assert.ok(raw.text.includes('"=HYPERLINK(""http://evil"")"'));

  const sessionsCsv = await call('GET', '/admin/export.csv?table=sessions', null, { 'x-admin-token': ADMIN });
  assert.ok(!sessionsCsv.text.includes('passwords'));
  for (const pw of Object.values((await store.getSession(s)).passwords)) assert.ok(!sessionsCsv.text.includes(pw));

  assert.equal((await call('GET', '/admin/export.csv?table=secrets', null, { 'x-admin-token': ADMIN })).status, 400);
});
