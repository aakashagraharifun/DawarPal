import { getLevel } from './levels.js';
import { SYSTEM_PROMPTS, fillTemplate } from './prompts.js';
import { REFUSALS } from './refusals.js';
import { checkInput } from './defenses/inputFilter.js';
import { checkOutput } from './defenses/outputCheck.js';
import { runJudge } from './defenses/judge.js';

// Runs one single-turn attempt through the level's defenses and returns the full
// attempt record (DB-shaped). Only `shown_reply` and `blocked_by` may go to the client.
//
// Throws LLMError/BusyError if the BOT call fails — those are errors, not attempts.
export async function runPipeline({
  level,
  password,
  userMessage,
  llm,
  botModel,
  judgeModel,
  judgeTimeoutMs,
  now = Date.now,
}) {
  const cfg = getLevel(level);
  const started = now();
  const record = {
    level,
    user_message: userMessage,
    bot_reply: null,
    shown_reply: null,
    blocked_by: null,
    judge_leak: null,
    judge_reason: null,
    bot_model: null,
    judge_model: null,
    latency_ms: null,
  };

  const finish = (blockedBy) => {
    record.blocked_by = blockedBy;
    record.shown_reply = blockedBy ? REFUSALS[blockedBy] : record.bot_reply;
    record.latency_ms = now() - started;
    return record;
  };

  // 1. Input filter
  if (cfg.inputFilter && checkInput(userMessage).blocked) {
    return finish('input_filter');
  }

  // 2. Bot — single turn: [system, user] only, never prior history.
  const systemPrompt = fillTemplate(SYSTEM_PROMPTS[cfg.systemPrompt], { PASSWORD: password });
  const bot = await llm({
    model: botModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
    maxTokens: 200, // visible reply; the LLM client adds headroom for hidden reasoning
    reasoning: { effort: 'low', exclude: true },
  });
  record.bot_reply = bot.content;
  record.bot_model = bot.model;

  // 3. Output check
  if (cfg.outputCheck && checkOutput(bot.content, password).blocked) {
    return finish('output_check');
  }

  // 4. Judge (fail closed)
  if (cfg.judge) {
    const verdict = await runJudge({
      llm,
      model: judgeModel,
      password,
      userMessage,
      botReply: bot.content,
      timeoutMs: judgeTimeoutMs,
    });
    record.judge_model = verdict.model;
    if (verdict.error) {
      record.judge_reason = `[judge_error] ${verdict.error}`;
      return finish('judge_error');
    }
    record.judge_leak = verdict.leak;
    record.judge_reason = verdict.reason;
    if (verdict.leak) return finish('judge');
  }

  // 5. Allowed
  return finish(null);
}
