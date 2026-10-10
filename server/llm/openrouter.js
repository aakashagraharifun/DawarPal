import { BusyError, LLMError } from './errors.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRY_AFTER_MS = 20_000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Returns ONLY the final visible text. Reasoning fields (message.reasoning,
// reasoning_details, …) are never read, and inline <think> blocks are removed.
export function extractContent(data) {
  const raw = data?.choices?.[0]?.message?.content;
  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
  }
  return stripThinking(text).trim();
}

export function stripThinking(text) {
  let out = text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '');
  // An unclosed thinking tag means everything after it is reasoning.
  const open = out.search(/<(think|thinking|reasoning)>/i);
  if (open !== -1) out = out.slice(0, open);
  return out;
}

function backoffDelay(attempt, retryAfterHeader, baseMs) {
  const retryAfterSec = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER_MS);
  }
  return baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

// OpenAI-compatible providers. `applyReasoning` adds the provider's own reasoning
// parameter and returns true if the model will think (so it needs token headroom).
export const PROVIDERS = {
  openrouter: {
    url: OPENROUTER_URL,
    keyName: 'OPENROUTER_API_KEY',
    modelPrefix: '',
    applyReasoning(body, reasoning) {
      body.reasoning = reasoning;
      return true;
    },
    headers: (referer) => ({ 'X-Title': 'Dwarpal', ...(referer ? { 'HTTP-Referer': referer } : {}) }),
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyName: 'GROQ_API_KEY',
    // Recorded as e.g. "groq/llama-3.3-70b-versatile" so the data shows the provider.
    modelPrefix: 'groq/',
    // Groq rejects unknown params; only its gpt-oss models accept reasoning_effort.
    applyReasoning(body, reasoning, model) {
      if (!/gpt-oss/i.test(model)) return false;
      if (reasoning.effort) body.reasoning_effort = reasoning.effort;
      return true;
    },
    headers: () => ({}),
  },
};

export function createLLMClient({
  apiKey,
  limiter,
  provider = 'openrouter',
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  maxTries = 3,
  backoffBaseMs = 2_000,
  defaultTimeoutMs = 45_000,
  // Thinking models spend part of max_tokens on hidden reasoning. When a call asks for
  // `reasoning`, this many extra tokens are added so `maxTokens` still means the budget
  // for the visible reply. (Free tiers count requests, not tokens.)
  reasoningHeadroomTokens = 0,
  referer,
}) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown LLM provider: ${provider}`);

  return async function callLLM({
    model,
    messages,
    temperature = 0,
    maxTokens,
    reasoning,
    timeoutMs = defaultTimeoutMs,
  }) {
    if (!apiKey) throw new LLMError(`${p.keyName} is not set`);

    const body = { model, messages, temperature, max_tokens: maxTokens };
    if (reasoning && p.applyReasoning(body, reasoning, model)) {
      body.max_tokens = maxTokens + reasoningHeadroomTokens;
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...p.headers(referer),
    };

    for (let attempt = 1; ; attempt++) {
      await limiter.acquire();

      let res;
      try {
        res = await fetchImpl(p.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        // Node's fetch hides the real cause (e.g. UND_ERR_CONNECT_TIMEOUT) behind "fetch failed".
        const cause = err?.cause?.code ?? err?.cause?.message;
        const reason = err?.name === 'TimeoutError' ? 'timeout' : `network: ${err?.message}${cause ? ` (${cause})` : ''}`;
        throw new LLMError(reason, { model });
      }

      let data = null;
      try {
        data = await res.json();
      } catch (err) {
        if (err?.name === 'TimeoutError') throw new LLMError('timeout', { model });
      }

      // OpenRouter can also report an upstream rate limit inside a 200 body.
      const rateLimited = res.status === 429 || data?.error?.code === 429;
      if (rateLimited) {
        if (attempt >= maxTries) throw new BusyError('rate_limited', { model, status: 429 });
        await sleep(backoffDelay(attempt, res.headers?.get?.('retry-after'), backoffBaseMs));
        continue;
      }

      if (!res.ok || data?.error || !data) {
        const msg = data?.error?.message ?? 'bad response';
        throw new LLMError(`http_${res.status}: ${msg}`, { model, status: res.status });
      }

      const returnedModel = p.modelPrefix + (typeof data.model === 'string' ? data.model : model);
      const content = extractContent(data);
      if (!content) {
        // Usually a thinking model that used the whole budget on reasoning (finish=length).
        const finish = data.choices?.[0]?.finish_reason ?? '?';
        const thought = data.usage?.completion_tokens_details?.reasoning_tokens ?? '?';
        throw new LLMError(`empty_response (finish=${finish}, reasoning_tokens=${thought}/${body.max_tokens})`, {
          model: returnedModel,
        });
      }

      return { content, model: returnedModel };
    }
  };
}
