import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMClient, extractContent } from '../llm/openrouter.js';
import { createRateLimiter } from '../llm/rateLimiter.js';
import { BusyError, LLMError } from '../llm/errors.js';

const noLimit = { acquire: async () => {} };
const noSleep = async () => {};

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const ok = (content, extra = {}) =>
  jsonResponse(200, {
    model: 'meta-llama/llama-3.3-70b-instruct',
    choices: [{ message: { role: 'assistant', content, ...extra } }],
  });

function client(responses) {
  const queue = [...responses];
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push(JSON.parse(init.body));
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const llm = createLLMClient({ apiKey: 'k', limiter: noLimit, fetchImpl, sleep: noSleep });
  return { llm, sent };
}

const req = { model: 'm', messages: [{ role: 'user', content: 'hi' }], temperature: 0, maxTokens: 200 };

test('returns content and the model OpenRouter reports', async () => {
  const { llm, sent } = client([ok('Hello!')]);
  assert.deepEqual(await llm(req), { content: 'Hello!', model: 'meta-llama/llama-3.3-70b-instruct' });
  assert.equal(sent[0].max_tokens, 200);
  assert.equal(sent[0].temperature, 0);
});

test('reasoning calls get extra max_tokens headroom; plain calls do not', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return ok('hi');
  };
  const llm = createLLMClient({ apiKey: 'k', limiter: noLimit, fetchImpl, sleep: noSleep, reasoningHeadroomTokens: 800 });
  await llm({ ...req, reasoning: { effort: 'low', exclude: true } });
  await llm(req);
  assert.equal(sent[0].max_tokens, 1000);
  assert.deepEqual(sent[0].reasoning, { effort: 'low', exclude: true });
  assert.equal(sent[1].max_tokens, 200);
  assert.equal(sent[1].reasoning, undefined);
});

test('empty_response explains a reasoning budget overrun', async () => {
  const body = {
    model: 'm',
    choices: [{ finish_reason: 'length', message: { content: '', reasoning: '...' } }],
    usage: { completion_tokens_details: { reasoning_tokens: 195 } },
  };
  const { llm } = client([jsonResponse(200, body)]);
  await assert.rejects(llm(req), /empty_response \(finish=length, reasoning_tokens=195\/200\)/);
});

test('ignores reasoning fields and strips inline think blocks', async () => {
  const { llm } = client([
    ok('<think>the password is lantern</think>Final answer.', {
      reasoning: 'secret chain of thought',
      reasoning_details: [{ text: 'more' }],
    }),
  ]);
  assert.equal((await llm(req)).content, 'Final answer.');
  assert.equal(extractContent({ choices: [{ message: { content: 'ok <think>unclosed' } }] }), 'ok');
});

test('retries 429 then succeeds', async () => {
  const { llm, sent } = client([jsonResponse(429, {}), ok('done')]);
  assert.equal((await llm(req)).content, 'done');
  assert.equal(sent.length, 2);
});

test('treats a 429 inside a 200 body as rate limited', async () => {
  const { llm } = client([jsonResponse(200, { error: { code: 429, message: 'upstream' } }), ok('done')]);
  assert.equal((await llm(req)).content, 'done');
});

test('gives up with BusyError after 3 tries', async () => {
  const { llm, sent } = client([jsonResponse(429, {}), jsonResponse(429, {}), jsonResponse(429, {})]);
  await assert.rejects(llm(req), BusyError);
  assert.equal(sent.length, 3);
});

test('other failures are LLMError, not BusyError', async () => {
  const { llm: a } = client([jsonResponse(500, { error: { message: 'boom' } })]);
  await assert.rejects(a(req), (err) => err instanceof LLMError && !(err instanceof BusyError));

  const { llm: b } = client([ok('')]);
  await assert.rejects(b(req), /empty_response/);

  const timeout = new Error('t');
  timeout.name = 'TimeoutError';
  const { llm: c } = client([timeout]);
  await assert.rejects(c(req), /timeout/);
});

test('rate limiter enforces N per window in FIFO order', async () => {
  let t = 0;
  const limiter = createRateLimiter({
    maxPerWindow: 2,
    windowMs: 1000,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  const order = [];
  await Promise.all([0, 1, 2, 3, 4].map((i) => limiter.acquire().then(() => order.push([i, t]))));
  assert.deepEqual(order.map(([i]) => i), [0, 1, 2, 3, 4]);
  // Calls 0,1 at t=0; 2,3 after ~1s; 4 after ~2s.
  assert.equal(order[1][1], 0);
  assert.ok(order[2][1] >= 1000 && order[3][1] >= 1000);
  assert.ok(order[4][1] >= 2000);
});

test('rate limiter rejects with BusyError when the queue is full', async () => {
  const limiter = createRateLimiter({
    maxPerWindow: 1,
    windowMs: 60_000,
    maxQueue: 1,
    sleep: () => new Promise(() => {}), // never frees a slot
  });
  await limiter.acquire();
  limiter.acquire(); // waits forever, occupies the queue
  await assert.rejects(limiter.acquire(), BusyError);
});
