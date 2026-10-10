// Shared pieces for the offline scripts (classify / sample / agreement).
import { config } from '../config.js';
import { createLLMFromConfig, usesGroq } from '../llm/index.js';
import { createRestClient } from '../store/supabaseStore.js';
import { extractFirstJsonObject } from '../defenses/judge.js';
import { ATTACK_CATEGORIES } from '../categories.js';
import { enableForceIpv4 } from '../forceIpv4.js';

if (config.forceIpv4) enableForceIpv4();

export function requireDb() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (server/.env.local or .env).');
    process.exit(1);
  }
  return createRestClient({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
}

// Same rate limits and retry policy as the game server (scripts use JUDGE_MODEL).
// NOTE: limits are per process — don't run this while people are playing, or the two
// will compete for the same provider quota.
export function createScriptLlm() {
  const [needs, key] = usesGroq(config.judgeModel)
    ? ['GROQ_API_KEY', config.groqApiKey]
    : ['OPENROUTER_API_KEY', config.openrouterApiKey];
  if (!key) {
    console.error(`${needs} must be set for JUDGE_MODEL=${config.judgeModel}.`);
    process.exit(1);
  }
  return createLLMFromConfig(config, { maxQueue: Infinity });
}

const NULLISH = new Set(['', 'null', 'none', 'n/a']);

// Parses the classifier's JSON. Returns null unless the primary category is valid.
// An invalid/duplicate secondary becomes null rather than failing the whole row.
export function parseClassification(text) {
  const obj = extractFirstJsonObject(text);
  if (!obj || typeof obj.category !== 'string') return null;
  const category = obj.category.trim().toLowerCase();
  if (!ATTACK_CATEGORIES.includes(category)) return null;
  let secondary = typeof obj.secondary === 'string' ? obj.secondary.trim().toLowerCase() : null;
  if (secondary !== null && (NULLISH.has(secondary) || !ATTACK_CATEGORIES.includes(secondary) || secondary === category)) {
    secondary = null;
  }
  return { category, secondary };
}

// Cohen's kappa for two raters over the same items. pairs: [[a, b], ...]
export function cohensKappa(pairs) {
  const n = pairs.length;
  if (!n) return { n: 0, agreement: NaN, kappa: NaN };
  const agree = pairs.filter(([a, b]) => a === b).length;
  const countA = new Map();
  const countB = new Map();
  for (const [a, b] of pairs) {
    countA.set(a, (countA.get(a) ?? 0) + 1);
    countB.set(b, (countB.get(b) ?? 0) + 1);
  }
  const labels = new Set([...countA.keys(), ...countB.keys()]);
  let pe = 0;
  for (const l of labels) pe += ((countA.get(l) ?? 0) / n) * ((countB.get(l) ?? 0) / n);
  const po = agree / n;
  return { n, agreement: po, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe) };
}

export function shuffle(items, randomInt) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const today = () => new Date().toISOString().slice(0, 10);
