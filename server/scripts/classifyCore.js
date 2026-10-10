import { CLASSIFIER_PROMPT } from '../categories.js';
import { fillTemplate } from '../prompts.js';
import { runJudge } from '../defenses/judge.js';
import { BusyError } from '../llm/errors.js';
import { fetchAllPages } from '../store/supabaseStore.js';
import { parseClassification } from './lib.js';

const CANDIDATES =
  'attempts?select=id,session_id,level,user_message,shown_reply,blocked_by,attack_category,offline_leak' +
  '&or=(attack_category.is.null,offline_leak.is.null)&order=created_at.asc,id.asc';

export async function classifyMessage({ llm, model, userMessage, timeoutMs }) {
  const res = await llm({
    model,
    messages: [{ role: 'user', content: fillTemplate(CLASSIFIER_PROMPT, { USER_MESSAGE: userMessage }) }],
    temperature: 0,
    maxTokens: 300,
    reasoning: { effort: 'low', exclude: true },
    timeoutMs,
  });
  const parsed = parseClassification(res.content);
  if (!parsed) throw new Error(`invalid classifier output: ${res.content.slice(0, 120)}`);
  return parsed;
}

// Fills attack_category / attack_secondary / offline_leak for every attempt still missing
// one. Each row is written as soon as it's done, so stopping at any point is safe:
// the next run picks up whatever is still null.
export async function runClassification({ request, llm, model, limit = Infinity, timeoutMs, log = console.log }) {
  // Collect the work list first: paging while rows drop out of the filter would skip some.
  const todo = (await fetchAllPages(request, CANDIDATES)).slice(0, limit);
  const summary = { total: todo.length, classified: 0, judged: 0, skippedJudge: 0, failed: 0, stoppedEarly: false };
  log(`${todo.length} attempt(s) need work.`);

  const passwordCache = new Map();
  async function passwordFor(sessionId, level) {
    if (!passwordCache.has(sessionId)) {
      const [row] = await request(`sessions?id=eq.${sessionId}&select=passwords`);
      passwordCache.set(sessionId, row?.passwords ?? {});
    }
    return passwordCache.get(sessionId)[String(level)];
  }

  for (const [i, row] of todo.entries()) {
    const patch = {};
    const notes = [];
    try {
      if (row.attack_category === null) {
        try {
          const c = await classifyMessage({ llm, model, userMessage: row.user_message, timeoutMs });
          patch.attack_category = c.category;
          patch.attack_secondary = c.secondary;
          summary.classified++;
          notes.push(c.secondary ? `${c.category}/${c.secondary}` : c.category);
        } catch (err) {
          if (err instanceof BusyError) throw err;
          summary.failed++;
          notes.push(`classify failed (${err.message})`);
        }
      }

      if (row.offline_leak === null && row.shown_reply !== null) {
        if (row.blocked_by) {
          // The player saw a fixed refusal text (verified password-free by tests).
          patch.offline_leak = false;
          summary.skippedJudge++;
          notes.push('leak=false (blocked)');
        } else {
          const password = await passwordFor(row.session_id, row.level);
          const verdict = await runJudge({
            llm,
            model,
            password,
            userMessage: row.user_message,
            botReply: row.shown_reply,
            timeoutMs,
          });
          if (verdict.error) {
            summary.failed++;
            notes.push(`judge failed (${verdict.error.slice(0, 60)})`);
          } else {
            patch.offline_leak = verdict.leak;
            summary.judged++;
            notes.push(`leak=${verdict.leak}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof BusyError) {
        summary.stoppedEarly = true;
        log('Rate limited by the LLM provider after retries — stopping. Re-run later to resume.');
        // Still save whatever this row already has.
        if (Object.keys(patch).length) await savePatch(request, row.id, patch);
        break;
      }
      throw err;
    }

    if (Object.keys(patch).length) await savePatch(request, row.id, patch);
    log(`[${i + 1}/${todo.length}] L${row.level} ${row.id.slice(0, 8)} → ${notes.join(', ')}`);
  }
  return summary;
}

function savePatch(request, id, patch) {
  return request(`attempts?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
}
