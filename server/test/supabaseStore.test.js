import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore, DbError } from '../store/supabaseStore.js';

// Records requests and replays canned responses.
function fakeFetch(responses) {
  const queue = [...responses];
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const [status, body] = queue.shift() ?? [200, []];
    return new Response(body === null ? '' : JSON.stringify(body), { status });
  };
  return { fetchImpl, sent };
}

const URL_ = 'https://abc.supabase.co/';
const ID = '11111111-2222-3333-4444-555555555555';

test('legacy JWT key goes in apikey + Authorization; new secret key in apikey only', async () => {
  const a = fakeFetch([[200, [{ id: ID }]]]);
  await createSupabaseStore({ url: URL_, serviceKey: 'eyJhbGciOi.x.y', fetchImpl: a.fetchImpl }).createSession();
  assert.equal(a.sent[0].headers.apikey, 'eyJhbGciOi.x.y');
  assert.equal(a.sent[0].headers.Authorization, 'Bearer eyJhbGciOi.x.y');
  assert.equal(a.sent[0].url, 'https://abc.supabase.co/rest/v1/sessions?select=id');

  const b = fakeFetch([[200, [{ id: ID }]]]);
  await createSupabaseStore({ url: URL_, serviceKey: 'sb_secret_abc', fetchImpl: b.fetchImpl }).createSession();
  assert.equal(b.sent[0].headers.apikey, 'sb_secret_abc');
  assert.equal(b.sent[0].headers.Authorization, undefined);
});

test('createSession stores 5 passwords and returns only the id', async () => {
  const { fetchImpl, sent } = fakeFetch([[201, [{ id: ID }]]]);
  const store = createSupabaseStore({ url: URL_, serviceKey: 'k', fetchImpl });
  assert.deepEqual(await store.createSession(), { id: ID });
  assert.equal(sent[0].method, 'POST');
  assert.deepEqual(Object.keys(sent[0].body.passwords), ['1', '2', '3', '4', '5']);
  assert.equal(sent[0].headers.Prefer, 'return=representation');
});

test('getSession returns the row or null', async () => {
  const row = { id: ID, passwords: { 1: 'lantern' }, current_level: 1, completed_at: null };
  const { fetchImpl, sent } = fakeFetch([[200, [row]], [200, []]]);
  const store = createSupabaseStore({ url: URL_, serviceKey: 'k', fetchImpl });
  assert.deepEqual(await store.getSession(ID), row);
  assert.match(sent[0].url, new RegExp(`sessions\\?id=eq\\.${ID}&select=`));
  assert.equal(await store.getSession(ID), null);
});

test('recordAttempt inserts every pipeline field plus session_id', async () => {
  const { fetchImpl, sent } = fakeFetch([[201, null]]);
  const store = createSupabaseStore({ url: URL_, serviceKey: 'k', fetchImpl });
  const record = {
    level: 4,
    user_message: 'u',
    bot_reply: 'b',
    shown_reply: 's',
    blocked_by: 'output_check',
    judge_leak: null,
    judge_reason: null,
    bot_model: 'm',
    judge_model: null,
    latency_ms: 12,
  };
  await store.recordAttempt(ID, record);
  assert.match(sent[0].url, /\/rest\/v1\/attempts$/);
  assert.deepEqual(sent[0].body, { session_id: ID, ...record });
  assert.equal(sent[0].headers.Prefer, 'return=minimal');
});

test('recordGuess and recordError hit their tables', async () => {
  const { fetchImpl, sent } = fakeFetch([[201, null], [201, null]]);
  const store = createSupabaseStore({ url: URL_, serviceKey: 'k', fetchImpl });
  await store.recordGuess(ID, 2, 'lantern', true);
  await store.recordError(ID, 2, 'busy', 'BusyError: rate_limited', 'hi');
  assert.deepEqual(sent[0].body, { session_id: ID, level: 2, guess: 'lantern', correct: true });
  assert.match(sent[1].url, /llm_errors$/);
  assert.deepEqual(sent[1].body, {
    session_id: ID,
    level: 2,
    kind: 'busy',
    detail: 'BusyError: rate_limited',
    user_message: 'hi',
  });
});

test('completeLevel calls the RPC and maps its result', async () => {
  const { fetchImpl, sent } = fakeFetch([[200, [{ new_level: 3, completed: false }]]]);
  const store = createSupabaseStore({ url: URL_, serviceKey: 'k', fetchImpl });
  assert.deepEqual(await store.completeLevel(ID, 2), { level: 3, completed: false });
  assert.match(sent[0].url, /rpc\/complete_level$/);
  assert.deepEqual(sent[0].body, { p_session_id: ID, p_level: 2, p_max_level: 5 });
});

test('HTTP errors become DbError with status', async () => {
  const { fetchImpl } = fakeFetch([[404, { message: 'relation "public.attempts" does not exist' }]]);
  const store = createSupabaseStore({ url: URL_, serviceKey: 'k', fetchImpl });
  await assert.rejects(store.recordAttempt(ID, {}), (err) => err instanceof DbError && err.status === 404);
});
