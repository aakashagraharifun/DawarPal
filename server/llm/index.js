import { createLLMClient } from './openrouter.js';
import { createRateLimiter } from './rateLimiter.js';
import { LLMError } from './errors.js';

const GROQ_PREFIX = 'groq:';

// Routes a call by model name: "groq:<model>" goes to Groq, anything else to OpenRouter.
// Example: BOT_MODEL=groq:llama-3.3-70b-versatile, JUDGE_MODEL=nvidia/…:free
export function createModelRouter({ openrouter, groq }) {
  return async function callLLM(req) {
    if (req.model.startsWith(GROQ_PREFIX)) {
      if (!groq) throw new LLMError(`GROQ_API_KEY is not set (needed for ${req.model})`);
      return groq({ ...req, model: req.model.slice(GROQ_PREFIX.length) });
    }
    return openrouter(req);
  };
}

// One rate limiter per provider: their limits are separate.
export function createLLMFromConfig(config, { maxQueue = config.llm.maxQueue } = {}) {
  const common = {
    maxTries: config.llm.maxTries,
    backoffBaseMs: config.llm.backoffBaseMs,
    defaultTimeoutMs: config.llm.timeoutMs,
    reasoningHeadroomTokens: config.llm.reasoningHeadroomTokens,
  };
  const openrouter = createLLMClient({
    ...common,
    provider: 'openrouter',
    apiKey: config.openrouterApiKey,
    referer: config.clientOrigin,
    limiter: createRateLimiter({ maxPerWindow: config.llm.maxPerMinute, windowMs: 60_000, maxQueue }),
  });
  const groq = config.groqApiKey
    ? createLLMClient({
        ...common,
        provider: 'groq',
        apiKey: config.groqApiKey,
        limiter: createRateLimiter({ maxPerWindow: config.llm.groqMaxPerMinute, windowMs: 60_000, maxQueue }),
      })
    : null;
  return createModelRouter({ openrouter, groq });
}

export const usesGroq = (model) => model.startsWith(GROQ_PREFIX);
