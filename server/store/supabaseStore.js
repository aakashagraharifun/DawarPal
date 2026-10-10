import { MAX_LEVEL } from '../levels.js';
import { assignPasswords } from '../passwords.js';

export class DbError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'DbError';
    this.status = status;
  }
}

// Minimal PostgREST client (Supabase REST API) — the server only needs a handful of
// queries, so this avoids pulling in supabase-js.
//
// Key handling: legacy service_role keys are JWTs and go in both `apikey` and
// `Authorization`. New-style secret keys (sb_secret_…) go in `apikey` only; the
// Supabase gateway maps them to the service role.
export function createRestClient({ url, serviceKey, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/`;
  const authHeaders = { apikey: serviceKey };
  if (serviceKey.startsWith('eyJ')) authHeaders.Authorization = `Bearer ${serviceKey}`;

  return async function request(path, { method = 'GET', body, prefer } = {}) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new DbError(`${method} ${path.split('?')[0]}: ${err?.message}`);
    }
    const text = await res.text();
    if (!res.ok) {
      throw new DbError(`${method} ${path.split('?')[0]} → ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    return text ? JSON.parse(text) : null;
  };
}

// Reads every row of `path` (which must include ?select=…&order=…) page by page.
// Stops on an empty page rather than a short one, so a project max-rows setting
// lower than pageSize can't silently truncate the result.
export async function fetchAllPages(request, path, { pageSize = 1000, onPage } = {}) {
  const all = [];
  let offset = 0;
  for (;;) {
    const rows = await request(`${path}&limit=${pageSize}&offset=${offset}`);
    if (!rows?.length) break;
    if (onPage) await onPage(rows);
    else all.push(...rows);
    offset += rows.length;
  }
  return all;
}

const SESSION_COLUMNS = 'id,nickname,created_at,passwords,current_level,completed_at';
// Public-safe session columns: never includes passwords.
const SESSION_SUMMARY_COLUMNS = 'id,nickname,created_at,current_level,completed_at';

// Same async interface as memoryStore.
export function createSupabaseStore({ url, serviceKey, fetchImpl }) {
  const request = createRestClient({ url, serviceKey, fetchImpl });

  return {
    // Fails fast with a readable message if the schema hasn't been applied.
    async healthCheck() {
      await request('sessions?select=id&limit=1');
      await request('attempts?select=id&limit=1');
      await request('guesses?select=id&limit=1');
      await request('llm_errors?select=id&limit=1');
    },

    async createSession() {
      const rows = await request('sessions?select=id', {
        method: 'POST',
        body: { passwords: assignPasswords() },
        prefer: 'return=representation',
      });
      return { id: rows[0].id };
    },

    // Server-only: includes passwords. Never pass this object to a response.
    async getSession(id) {
      const rows = await request(`sessions?id=eq.${encodeURIComponent(id)}&select=${SESSION_COLUMNS}`);
      return rows[0] ?? null;
    },

    async recordAttempt(sessionId, record) {
      await request('attempts', {
        method: 'POST',
        body: { session_id: sessionId, ...record },
        prefer: 'return=minimal',
      });
    },

    async recordGuess(sessionId, level, guess, correct) {
      await request('guesses', {
        method: 'POST',
        body: { session_id: sessionId, level, guess, correct },
        prefer: 'return=minimal',
      });
    },

    async recordError(sessionId, level, kind, detail, userMessage) {
      await request('llm_errors', {
        method: 'POST',
        body: { session_id: sessionId, level, kind, detail, user_message: userMessage },
        prefer: 'return=minimal',
      });
    },

    async completeLevel(sessionId, level) {
      const rows = await request('rpc/complete_level', {
        method: 'POST',
        body: { p_session_id: sessionId, p_level: level, p_max_level: MAX_LEVEL },
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { level: row.new_level, completed: row.completed };
    },

    async setNickname(sessionId, nickname) {
      await request(`sessions?id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        body: { nickname },
        prefer: 'return=minimal',
      });
    },

    // Bulk reads for leaderboard/stats. Sessions never include passwords here.
    listSessions() {
      return fetchAllPages(request, `sessions?select=${SESSION_SUMMARY_COLUMNS}&order=id.asc`);
    },
    listAttempts(columns) {
      return fetchAllPages(request, `attempts?select=${columns.join(',')}&order=id.asc`);
    },
    listGuesses(columns) {
      return fetchAllPages(request, `guesses?select=${columns.join(',')}&order=id.asc`);
    },

    // Streams a table for CSV export, oldest first.
    exportRows(table, columns, onPage) {
      return fetchAllPages(request, `${table}?select=${columns.join(',')}&order=created_at.asc,id.asc`, {
        onPage,
      });
    },
  };
}
