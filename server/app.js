import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { runPipeline } from './pipeline.js';
import { isCorrectGuess } from './passwords.js';
import { BusyError } from './llm/errors.js';
import { LEVELS } from './levels.js';
import { createCooldowns } from './cooldowns.js';
import { sanitizeNickname } from './nickname.js';
import { computeLeaderboard } from './leaderboard.js';
import { computeStats } from './stats.js';
import { EXPORT_COLUMNS, csvRow } from './csv.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_CHARS = 1000;
const MAX_GUESS_CHARS = 100;
const LEADERBOARD_TTL_MS = 15_000;
const STATS_TTL_MS = 60_000;

const BUSY_MESSAGE = 'The gatekeeper is busy right now. Please try again in a moment.';
const LLM_FAIL_MESSAGE = 'Dwarpal seems lost in thought. Please try again.';

function badRequest(res, error) {
  return res.status(400).json({ error });
}

function tooSoon(res, seconds, what) {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ error: `Slow down, traveler. You can ${what} again in ${seconds}s.`, retryAfter: seconds });
}

// Constant-time comparison (hashing first makes lengths equal).
function tokenMatches(given, expected) {
  if (typeof given !== 'string' || !expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// Caches an async loader for ttlMs; concurrent callers share one in-flight load.
function cached(ttlMs, load) {
  let value;
  let at = 0;
  let pending = null;
  const get = async () => {
    if (value !== undefined && Date.now() - at < ttlMs) return value;
    pending ??= load()
      .then((v) => {
        value = v;
        at = Date.now();
        return v;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  get.invalidate = () => {
    at = 0;
  };
  return get;
}

// Public, non-secret level info for the UI (no prompt text, nothing per-session).
const PUBLIC_LEVELS = LEVELS.map(({ level, systemPrompt, inputFilter, outputCheck, judge, greeting }) => ({
  level,
  protectedPrompt: systemPrompt === 'protected',
  inputFilter,
  outputCheck,
  judge,
  greeting,
}));

export function createApp({
  store,
  llm,
  config,
  logError = console.error,
  fallbackLog = async () => {},
  cooldowns = createCooldowns(),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '16kb' }));

  const chatCooldownMs = config.cooldowns?.chatMs ?? 0;
  const guessCooldownMs = config.cooldowns?.guessMs ?? 0;
  const chatsInFlight = new Set();

  const leaderboardData = cached(LEADERBOARD_TTL_MS, async () => {
    const [sessions, attempts, guesses] = await Promise.all([
      store.listSessions(),
      store.listAttempts(['session_id']),
      store.listGuesses(['session_id', 'correct', 'created_at']),
    ]);
    return { sessions, attempts, guesses };
  });

  const stats = cached(STATS_TTL_MS, async () => {
    const [sessions, attempts, guesses] = await Promise.all([
      store.listSessions(),
      store.listAttempts(['session_id', 'level', 'blocked_by', 'attack_category', 'led_to_win', 'offline_leak']),
      store.listGuesses(['session_id', 'level', 'correct']),
    ]);
    return computeStats({ sessions, attempts, guesses });
  });

  // A failed log write must never lose the row or break gameplay: fall back to disk.
  async function safeWrite(table, row, write) {
    try {
      await write();
    } catch (err) {
      logError(`[db] ${table} insert failed, using fallback log: ${err?.message}`);
      await fallbackLog(table, row, err);
    }
  }

  async function loadSession(req, res, sessionId) {
    if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
      badRequest(res, 'Invalid sessionId.');
      return null;
    }
    const session = await store.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return null;
    }
    return session;
  }

  app.get('/api/levels', (req, res) => {
    res.json({ levels: PUBLIC_LEVELS, cooldowns: { chatMs: chatCooldownMs, guessMs: guessCooldownMs } });
  });

  app.post('/api/session', async (req, res) => {
    const { id } = await store.createSession();
    res.status(201).json({ sessionId: id });
  });

  app.get('/api/progress', async (req, res) => {
    const session = await loadSession(req, res, req.query.sessionId);
    if (!session) return;
    res.json({ level: session.current_level, completed: session.completed_at !== null });
  });

  app.post('/api/chat', async (req, res) => {
    const { sessionId, message } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      return badRequest(res, 'Message is required.');
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return badRequest(res, `Message must be at most ${MAX_MESSAGE_CHARS} characters.`);
    }
    const session = await loadSession(req, res, sessionId);
    if (!session) return;
    if (session.completed_at) {
      return res.status(409).json({ error: 'You have already passed every gate.' });
    }
    if (chatsInFlight.has(session.id)) {
      return res.status(429).json({ error: 'Dwarpal is still answering your last message.', retryAfter: 1 });
    }
    const wait = cooldowns.take(`chat:${session.id}`, chatCooldownMs);
    if (wait) return tooSoon(res, wait, 'speak');

    const level = session.current_level;
    chatsInFlight.add(session.id);
    try {
      let record;
      try {
        record = await runPipeline({
          level,
          password: session.passwords[String(level)],
          userMessage: message,
          llm,
          botModel: config.botModel,
          judgeModel: config.judgeModel,
          judgeTimeoutMs: config.llm.timeoutMs,
        });
      } catch (err) {
        // Errors are logged as errors, not as attempt results.
        const busy = err instanceof BusyError;
        const kind = busy ? 'busy' : 'llm_error';
        const detail = `${err?.name}: ${err?.message}`;
        logError(`[chat error] session=${session.id} level=${level} ${detail}`);
        await safeWrite('llm_errors', { session_id: session.id, level, kind, detail, user_message: message }, () =>
          store.recordError(session.id, level, kind, detail, message),
        );
        return res
          .status(busy ? 503 : 502)
          .json({ error: busy ? BUSY_MESSAGE : LLM_FAIL_MESSAGE, busy });
      }

      await safeWrite('attempts', { session_id: session.id, ...record }, () =>
        store.recordAttempt(session.id, record),
      );
      // Only the shown reply and the blocking stage leave the server.
      res.json({ reply: record.shown_reply, blockedBy: record.blocked_by, level });
    } finally {
      chatsInFlight.delete(session.id);
    }
  });

  app.post('/api/guess', async (req, res) => {
    const { sessionId, guess } = req.body ?? {};
    if (typeof guess !== 'string' || !guess.trim()) {
      return badRequest(res, 'Guess is required.');
    }
    if (guess.length > MAX_GUESS_CHARS) {
      return badRequest(res, `Guess must be at most ${MAX_GUESS_CHARS} characters.`);
    }
    const session = await loadSession(req, res, sessionId);
    if (!session) return;
    if (session.completed_at) {
      return res.status(409).json({ error: 'You have already passed every gate.' });
    }
    const wait = cooldowns.take(`guess:${session.id}`, guessCooldownMs);
    if (wait) return tooSoon(res, wait, 'guess');

    const level = session.current_level;
    const correct = isCorrectGuess(guess, session.passwords[String(level)]);
    await safeWrite('guesses', { session_id: session.id, level, guess, correct }, () =>
      store.recordGuess(session.id, level, guess, correct),
    );

    if (!correct) {
      return res.json({ correct: false, newLevel: level, completed: false });
    }
    const progress = await store.completeLevel(session.id, level);
    leaderboardData.invalidate();
    res.json({ correct: true, newLevel: progress.level, completed: progress.completed });
  });

  app.post('/api/nickname', async (req, res) => {
    const { sessionId, nickname } = req.body ?? {};
    const result = sanitizeNickname(nickname);
    if (!result.ok) return badRequest(res, result.error);
    const session = await loadSession(req, res, sessionId);
    if (!session) return;
    await store.setNickname(session.id, result.nickname);
    leaderboardData.invalidate();
    res.json({ nickname: result.nickname });
  });

  app.get('/api/leaderboard', async (req, res) => {
    const { sessionId } = req.query;
    const mine = typeof sessionId === 'string' && UUID_RE.test(sessionId) ? sessionId : null;
    const data = await leaderboardData();
    res.json(computeLeaderboard({ ...data, limit: 20, sessionId: mine }));
  });

  // Aggregated and anonymized: counts only, no message text or identifiers.
  app.get('/api/stats', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await stats());
  });

  app.get('/api/admin/export.csv', async (req, res) => {
    if (!config.adminToken) return res.status(404).json({ error: 'Not found.' });
    if (!tokenMatches(req.get('x-admin-token'), config.adminToken)) {
      return res.status(401).json({ error: 'Invalid admin token.' });
    }
    const table = req.query.table ?? 'attempts';
    const columns = EXPORT_COLUMNS[table];
    if (!columns) return badRequest(res, `table must be one of: ${Object.keys(EXPORT_COLUMNS).join(', ')}`);
    // ?raw=1 → exact text for pandas/R; default guards against spreadsheet formula injection.
    const raw = req.query.raw === '1';

    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dwarpal-${table}-${date}.csv"`,
      'Cache-Control': 'no-store',
    });
    try {
      // BOM helps Excel detect UTF-8; omitted in raw mode so parsers don't see it in the header.
      res.write((raw ? '' : '﻿') + csvRow(columns, { safe: false }));
      await store.exportRows(table, columns, async (rows) => {
        for (const row of rows) res.write(csvRow(columns.map((c) => row[c]), { safe: !raw }));
      });
      res.end();
    } catch (err) {
      logError('[export] failed:', err?.message);
      res.destroy(err);
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  // Never echo internal error details to the client.
  app.use((err, req, res, next) => {
    if (res.headersSent) return res.destroy(err);
    if (err?.type === 'entity.parse.failed') return badRequest(res, 'Invalid JSON body.');
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    logError('[unhandled]', err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
