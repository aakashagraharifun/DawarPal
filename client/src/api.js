const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the vault. Check your connection and try again.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response.
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status}).`, res.status, data);
  return data;
}

export const api = {
  levels: () => request('/api/levels'),
  createSession: () => request('/api/session', { method: 'POST' }),
  progress: (sessionId) => request(`/api/progress?sessionId=${encodeURIComponent(sessionId)}`),
  chat: (sessionId, message) => request('/api/chat', { method: 'POST', body: { sessionId, message } }),
  guess: (sessionId, guess) => request('/api/guess', { method: 'POST', body: { sessionId, guess } }),
  setNickname: (sessionId, nickname) =>
    request('/api/nickname', { method: 'POST', body: { sessionId, nickname } }),
  leaderboard: (sessionId) =>
    request(`/api/leaderboard${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),
  stats: () => request('/api/stats'),

  // Researcher-only CSV download. The token is sent as a header, never stored.
  async exportCsv(token, table, raw) {
    const qs = new URLSearchParams({ table, ...(raw ? { raw: '1' } : {}) });
    let res;
    try {
      res = await fetch(`${BASE}/api/admin/export.csv?${qs}`, { headers: { 'x-admin-token': token } });
    } catch {
      throw new ApiError('Cannot reach the server.', 0);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.error ?? `Export failed (${res.status}).`, res.status);
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${table}.csv`;
    return { blob: await res.blob(), name };
  },
};
