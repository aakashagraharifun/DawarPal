import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMClient } from '../llm/openrouter.js';
import { createModelRouter } from '../llm/index.js';
import { LLMError } from '../llm/errors.js';

const noLimit = { acquire: async () => {} };

function capture(model = 'llama-3.3-70b-versatile') {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ model, choices: [{ message: { content: 'Hi.' } }] }), { status: 200 });
  };
  return { sent, fetchImpl };
}

const req = (over) => ({ model: 'm', messages: [{ role: 'user', content: 'x' }], temperature: 0, maxTokens: 200, ...over });

test('groq: right URL, provider-tagged model, no OpenRouter-only fields', async () => {
  const { sent, fetchImpl } = capture();
  const groq = createLLMClient({ provider: 'groq', apiKey: 'gsk', limiter: noLimit, fetchImpl, reasoningHeadroomTokens: 800 });
  const r = await groq(req({ model: 'llama-3.3-70b-versatile', reasoning: { effort: 'low', exclude: true } }));
  assert.equal(sent[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(sent[0].headers.Authorization, 'Bearer gsk');
  assert.equal(sent[0].headers['X-Title'], undefined);
  assert.equal(sent[0].body.reasoning, undefined, 'Groq rejects the OpenRouter reasoning object');
  assert.equal(sent[0].body.reasoning_effort, undefined, 'llama is not a reasoning model');
  assert.equal(sent[0].body.max_tokens, 200, 'no headroom for a non-reasoning model');
  assert.equal(r.model, 'groq/llama-3.3-70b-versatile');
});

test('groq: gpt-oss gets reasoning_effort + headroom', async () => {
  const { sent, fetchImpl } = capture('openai/gpt-oss-120b');
  const groq = createLLMClient({ provider: 'groq', apiKey: 'gsk', limiter: noLimit, fetchImpl, reasoningHeadroomTokens: 800 });
  await groq(req({ model: 'openai/gpt-oss-120b', maxTokens: 300, reasoning: { effort: 'low', exclude: true } }));
  assert.equal(sent[0].body.reasoning_effort, 'low');
  assert.equal(sent[0].body.max_tokens, 1100);
});

test('missing key names the right variable', async () => {
  const groq = createLLMClient({ provider: 'groq', apiKey: '', limiter: noLimit });
  await assert.rejects(groq(req()), /GROQ_API_KEY is not set/);
});

test('router: groq: prefix goes to Groq (prefix stripped), everything else to OpenRouter', async () => {
  const calls = [];
  const fake = (name) => async (r) => {
    calls.push([name, r.model]);
    return { content: 'ok', model: r.model };
  };
  const llm = createModelRouter({ openrouter: fake('openrouter'), groq: fake('groq') });
  await llm(req({ model: 'groq:llama-3.3-70b-versatile' }));
  await llm(req({ model: 'nvidia/nemotron-3-super-120b-a12b:free' }));
  assert.deepEqual(calls, [
    ['groq', 'llama-3.3-70b-versatile'],
    ['openrouter', 'nvidia/nemotron-3-super-120b-a12b:free'],
  ]);

  const noGroq = createModelRouter({ openrouter: fake('openrouter'), groq: null });
  await assert.rejects(noGroq(req({ model: 'groq:x' })), (e) => e instanceof LLMError && /GROQ_API_KEY/.test(e.message));
});
