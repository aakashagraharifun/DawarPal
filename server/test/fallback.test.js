import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { createMemoryStore } from '../store/memoryStore.js';
import { createFallbackLog } from '../fallbackLog.js';
import { createFakeLlm } from './fakeLlm.js';

test('if the DB insert fails, the player still gets a reply and the row goes to the fallback file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dwarpal-'));
  const path = join(dir, 'unsaved.jsonl');
  const store = createMemoryStore();
  store.recordAttempt = async () => {
    throw new Error('db down');
  };
  const app = createApp({
    store,
    llm: createFakeLlm(),
    config: { clientOrigin: '*', botModel: 'b', judgeModel: 'j', llm: { timeoutMs: 1000 } },
    logError: () => {},
    fallbackLog: createFallbackLog(path),
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const { sessionId } = await (await fetch(`${base}/session`, { method: 'POST' })).json();
    const res = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, message: 'hello' }),
    });
    assert.equal(res.status, 200);

    const [line] = (await readFile(path, 'utf8')).trim().split('\n');
    const entry = JSON.parse(line);
    assert.equal(entry.table, 'attempts');
    assert.equal(entry.row.session_id, sessionId);
    assert.equal(entry.row.user_message, 'hello');
    assert.equal(entry.error, 'db down');
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
