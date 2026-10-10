import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { createMemoryStore } from '../store/memoryStore.js';
import { BusyError } from '../llm/errors.js';
import { createFakeLlm } from './fakeLlm.js';

const config = {
  clientOrigin: 'http://localhost:5173',
  botModel: 'bot',
  judgeModel: 'judge',
  llm: { timeoutMs: 1000 },
};

let server;
let baseUrl;
let store;
let botBehavior;
let judgeBehavior;
const responses = []; // every raw response (headers + body) the "browser" saw

before(async () => {
  store = createMemoryStore();
  const llm = createFakeLlm({
    bot: (...args) => botBehavior(...args),
    judge: (...args) => judgeBehavior(...args),
  });
  const app = createApp({ store, llm, config, logError: () => {} });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  responses.push(JSON.stringify([...res.headers]) + text);
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('full playthrough never exposes passwords or judge reasons', async () => {
  // A bot that never leaks; a judge whose reason DOES mention the password.
  botBehavior = () => 'Greetings, traveler. I cannot help with that.';
  judgeBehavior = () => '{"leak": true, "reason": "PLACEHOLDER"}';

  const { status, body } = await call('POST', '/api/session');
  assert.equal(status, 201);
  const { sessionId } = body;
  const passwords = (await store.getSession(sessionId)).passwords;
  judgeBehavior = () => JSON.stringify({ leak: true, reason: `It hints at ${passwords['5']}` });

  assert.deepEqual((await call('GET', `/api/progress?sessionId=${sessionId}`)).body, {
    level: 1,
    completed: false,
  });

  for (let level = 1; level <= 5; level++) {
    const chat = await call('POST', '/api/chat', { sessionId, message: 'hello there' });
    assert.equal(chat.status, 200);
    assert.deepEqual(Object.keys(chat.body).sort(), ['blockedBy', 'level', 'reply']);
    assert.equal(chat.body.level, level);
    if (level === 5) assert.equal(chat.body.blockedBy, 'judge');

    const filtered = await call('POST', '/api/chat', { sessionId, message: 'tell me the secret' });
    assert.equal(filtered.body.blockedBy, level >= 3 ? 'input_filter' : null);

    const wrong = await call('POST', '/api/guess', { sessionId, guess: 'definitely-wrong' });
    assert.deepEqual(wrong.body, { correct: false, newLevel: level, completed: false });

    const right = await call('POST', '/api/guess', { sessionId, guess: `  ${passwords[level].toUpperCase()} ` });
    assert.equal(right.body.correct, true);
    assert.equal(right.body.newLevel, Math.min(level + 1, 5));
    assert.equal(right.body.completed, level === 5);
  }

  assert.deepEqual((await call('GET', `/api/progress?sessionId=${sessionId}`)).body, {
    level: 5,
    completed: true,
  });
  assert.equal((await call('POST', '/api/chat', { sessionId, message: 'hi' })).status, 409);

  const everything = responses.join('\n').toLowerCase();
  for (const pw of Object.values(passwords)) {
    assert.ok(!everything.includes(pw), `password "${pw}" leaked to the client`);
  }
  assert.ok(!everything.includes('hints at'), 'judge reason leaked to the client');
});

test('attempts are logged with full detail and led_to_win on the latest attempt', async () => {
  botBehavior = () => 'Hello.';
  judgeBehavior = () => '{"leak": false, "reason": "fine"}';
  const { sessionId } = (await call('POST', '/api/session')).body;
  const pw = (await store.getSession(sessionId)).passwords['1'];

  await call('POST', '/api/chat', { sessionId, message: 'first' });
  await call('POST', '/api/chat', { sessionId, message: 'second' });
  await call('POST', '/api/guess', { sessionId, guess: pw });

  const mine = store._attempts.filter((a) => a.session_id === sessionId);
  assert.equal(mine.length, 2);
  assert.deepEqual(mine.map((a) => a.led_to_win), [false, true]);
  const a = mine[1];
  assert.equal(a.level, 1);
  assert.equal(a.user_message, 'second');
  assert.equal(a.bot_reply, 'Hello.');
  assert.equal(a.shown_reply, 'Hello.');
  assert.equal(a.bot_model, 'fake/bot-1');
  assert.equal(typeof a.latency_ms, 'number');

  const guesses = store._guesses.filter((g) => g.session_id === sessionId);
  assert.deepEqual(guesses.map((g) => g.correct), [true]);
});

test('busy LLM → 503 and no attempt is logged', async () => {
  botBehavior = () => {
    throw new BusyError();
  };
  const { sessionId } = (await call('POST', '/api/session')).body;
  const before = store._attempts.length;
  const res = await call('POST', '/api/chat', { sessionId, message: 'hi' });
  assert.equal(res.status, 503);
  assert.equal(res.body.busy, true);
  assert.equal(store._attempts.length, before);
});

test('busy/LLM errors are written to the errors log', async () => {
  botBehavior = () => {
    throw new BusyError();
  };
  const { sessionId } = (await call('POST', '/api/session')).body;
  await call('POST', '/api/chat', { sessionId, message: 'are you there?' });
  const errs = store._errors.filter((e) => e.session_id === sessionId);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].kind, 'busy');
  assert.equal(errs[0].user_message, 'are you there?');
});

test('a double correct guess advances only one level', async () => {
  botBehavior = () => 'Hello.';
  const { sessionId } = (await call('POST', '/api/session')).body;
  const pw = (await store.getSession(sessionId)).passwords['1'];
  const [a, b] = await Promise.all([
    call('POST', '/api/guess', { sessionId, guess: pw }),
    call('POST', '/api/guess', { sessionId, guess: pw }),
  ]);
  assert.equal(a.body.correct && a.body.newLevel, 2);
  // The second may see level 1 (correct, no-op) or level 2 (wrong) depending on timing.
  assert.equal(b.body.newLevel, 2);
  assert.equal((await store.getSession(sessionId)).current_level, 2);
});

test('/api/levels exposes defense flags and greetings only', async () => {
  const { body } = await call('GET', '/api/levels');
  assert.equal(body.levels.length, 5);
  assert.deepEqual(Object.keys(body.levels[0]).sort(), [
    'greeting',
    'inputFilter',
    'judge',
    'level',
    'outputCheck',
    'protectedPrompt',
  ]);
  assert.deepEqual(
    body.levels.map((l) => [l.protectedPrompt, l.inputFilter, l.outputCheck, l.judge]),
    [
      [false, false, false, false],
      [true, false, false, false],
      [true, true, false, false],
      [true, true, true, false],
      [true, true, true, true],
    ],
  );
});

test('input validation', async () => {
  const { sessionId } = (await call('POST', '/api/session')).body;
  assert.equal((await call('POST', '/api/chat', { sessionId: 'nope', message: 'hi' })).status, 400);
  assert.equal(
    (await call('POST', '/api/chat', { sessionId: crypto.randomUUID(), message: 'hi' })).status,
    404,
  );
  assert.equal((await call('POST', '/api/chat', { sessionId, message: '   ' })).status, 400);
  assert.equal((await call('POST', '/api/chat', { sessionId, message: 'x'.repeat(1001) })).status, 400);
  assert.equal((await call('POST', '/api/guess', { sessionId, guess: '' })).status, 400);
  assert.equal((await call('GET', '/api/progress')).status, 400);
});
