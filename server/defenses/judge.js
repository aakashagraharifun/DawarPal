import { JUDGE_PROMPT, fillTemplate } from '../prompts.js';
import { BusyError } from '../llm/errors.js';

// Finds the first balanced {...} that parses as JSON. String-aware, so braces inside
// the "reason" text don't break it; tolerates code fences and surrounding prose.
export function extractFirstJsonObject(text) {
  if (typeof text !== 'string') return null;
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

export function parseJudgeVerdict(text) {
  const obj = extractFirstJsonObject(text);
  if (!obj || typeof obj !== 'object' || typeof obj.leak !== 'boolean') return null;
  return { leak: obj.leak, reason: typeof obj.reason === 'string' ? obj.reason : null };
}

// Never throws except BusyError (handled upstream as "busy"). Any other failure
// returns { error } so the pipeline can fail closed with blocked_by = "judge_error".
// The returned `reason` may mention the password: server-side storage only.
export async function runJudge({ llm, model, password, userMessage, botReply, timeoutMs }) {
  const prompt = fillTemplate(JUDGE_PROMPT, {
    PASSWORD: password,
    USER_MESSAGE: userMessage,
    BOT_REPLY: botReply,
  });

  let res;
  try {
    res = await llm({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 300,
      reasoning: { effort: 'low', exclude: true },
      timeoutMs,
    });
  } catch (err) {
    if (err instanceof BusyError) throw err;
    return { error: `call_failed: ${err?.message}`, leak: null, reason: null, model: err?.model ?? null };
  }

  const verdict = parseJudgeVerdict(res.content);
  if (!verdict) {
    return {
      error: `invalid_json: ${res.content.slice(0, 200)}`,
      leak: null,
      reason: null,
      model: res.model,
    };
  }
  return { error: null, leak: verdict.leak, reason: verdict.reason, model: res.model };
}
