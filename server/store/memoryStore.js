import { randomUUID } from 'node:crypto';
import { MAX_LEVEL } from '../levels.js';
import { assignPasswords } from '../passwords.js';

const pick = (row, columns) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));

// In-memory store for tests and local dev without Supabase. Same async interface as
// supabaseStore.js; rows are shaped like the DB tables (snake_case). Lost on restart.
export function createMemoryStore({ onAttempt, onSessionCreated } = {}) {
  const sessions = new Map();
  const attempts = [];
  const guesses = [];
  const errors = [];

  return {
    async createSession() {
      const session = {
        id: randomUUID(),
        nickname: null,
        created_at: new Date().toISOString(),
        passwords: assignPasswords(),
        current_level: 1,
        completed_at: null,
      };
      sessions.set(session.id, session);
      onSessionCreated?.(session);
      return { id: session.id };
    },

    // Server-only: includes passwords. Never pass this object to a response.
    async getSession(id) {
      return sessions.get(id) ?? null;
    },

    async recordAttempt(sessionId, record) {
      const row = {
        id: randomUUID(),
        session_id: sessionId,
        created_at: new Date().toISOString(),
        ...record,
        led_to_win: false,
        attack_category: null,
        attack_secondary: null,
        offline_leak: null,
      };
      attempts.push(row);
      onAttempt?.(row);
      return row;
    },

    async recordGuess(sessionId, level, guess, correct) {
      const row = {
        id: randomUUID(),
        session_id: sessionId,
        level,
        guess,
        correct,
        created_at: new Date().toISOString(),
      };
      guesses.push(row);
      return row;
    },

    async recordError(sessionId, level, kind, detail, userMessage) {
      errors.push({
        id: randomUUID(),
        session_id: sessionId,
        level,
        kind,
        detail,
        user_message: userMessage,
        created_at: new Date().toISOString(),
      });
    },

    // Called on a correct guess: flag the latest attempt on that level as the winner
    // and advance the session. Returns the new public progress. No-op if the session
    // has already moved past `level` (double-submit).
    async completeLevel(sessionId, level) {
      const session = sessions.get(sessionId);
      const progress = () => ({ level: session.current_level, completed: session.completed_at !== null });
      if (session.current_level !== level || session.completed_at) return progress();

      for (let i = attempts.length - 1; i >= 0; i--) {
        const a = attempts[i];
        if (a.session_id === sessionId && a.level === level) {
          a.led_to_win = true;
          break;
        }
      }
      if (level >= MAX_LEVEL) {
        session.completed_at = new Date().toISOString();
      } else {
        session.current_level = level + 1;
      }
      return progress();
    },

    async setNickname(sessionId, nickname) {
      const session = sessions.get(sessionId);
      if (session) session.nickname = nickname;
    },

    async listSessions() {
      return [...sessions.values()].map(({ passwords: _omit, ...rest }) => ({ ...rest }));
    },
    async listAttempts(columns) {
      return attempts.map((a) => pick(a, columns));
    },
    async listGuesses(columns) {
      return guesses.map((g) => pick(g, columns));
    },

    async exportRows(table, columns, onPage) {
      const source = {
        attempts,
        guesses,
        llm_errors: errors,
        sessions: [...sessions.values()],
      }[table];
      await onPage(source.map((row) => pick(row, columns)));
    },

    // Test/debug helpers.
    _attempts: attempts,
    _guesses: guesses,
    _errors: errors,
  };
}
