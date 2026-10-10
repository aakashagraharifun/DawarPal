import { fileURLToPath } from 'node:url';

// loadEnvFile never overwrites a variable that is already set, so precedence is:
// real environment > .env.local > .env
for (const file of ['./.env.local', './.env']) {
  try {
    process.loadEnvFile(fileURLToPath(new URL(file, import.meta.url)));
  } catch {
    // File missing — fine.
  }
}

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 3001),
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  groqApiKey: process.env.GROQ_API_KEY ?? '',
  botModel: process.env.BOT_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
  judgeModel: process.env.JUDGE_MODEL || 'openai/gpt-oss-120b:free',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
  adminToken: process.env.ADMIN_TOKEN ?? '',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  llm: {
    maxPerMinute: num(process.env.LLM_MAX_PER_MINUTE, 18),
    // Groq free tier allows ~30 requests/min per model; stay just under.
    groqMaxPerMinute: num(process.env.GROQ_MAX_PER_MINUTE, 28),
    maxQueue: num(process.env.LLM_MAX_QUEUE, 40),
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 45_000),
    // Extra max_tokens for hidden reasoning on top of the visible budget (bot 200, judge 300).
    reasoningHeadroomTokens: Number(process.env.LLM_REASONING_HEADROOM ?? 800) || 0,
    maxTries: 3,
    backoffBaseMs: 2_000,
  },
  // Per-session cooldowns (single server instance: kept in memory).
  cooldowns: {
    chatMs: num(process.env.CHAT_COOLDOWN_MS, 8_000),
    guessMs: num(process.env.GUESS_COOLDOWN_MS, 5_000),
  },
  forceIpv4: process.env.FORCE_IPV4 !== 'false',
  debugPasswords:
    process.env.DEBUG_PASSWORDS === 'true' && process.env.NODE_ENV !== 'production',
};
