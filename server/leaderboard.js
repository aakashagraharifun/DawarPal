// Ranking: highest level (finishing all 5 counts as above level 5), then fewest
// attempts, then fastest. "Time" = from session start to the last gate opened
// (completion time if finished).

function rowFor(session, attemptCount, lastCorrectAt) {
  const completed = session.completed_at !== null && session.completed_at !== undefined;
  const reachedAt = completed ? session.completed_at : (lastCorrectAt ?? session.created_at);
  return {
    sessionId: session.id,
    nickname: session.nickname,
    level: session.current_level,
    completed,
    attempts: attemptCount ?? 0,
    seconds: Math.max(0, Math.round((Date.parse(reachedAt) - Date.parse(session.created_at)) / 1000)),
  };
}

const score = (r) => (r.completed ? 6 : r.level);

function compare(a, b) {
  return score(b) - score(a) || a.attempts - b.attempts || a.seconds - b.seconds;
}

// sessions: [{ id, nickname, current_level, completed_at, created_at }]
// attempts: [{ session_id }], guesses: [{ session_id, correct, created_at }]
export function computeLeaderboard({ sessions, attempts, guesses, limit = 20, sessionId = null }) {
  const attemptCounts = new Map();
  for (const a of attempts) attemptCounts.set(a.session_id, (attemptCounts.get(a.session_id) ?? 0) + 1);

  const lastCorrect = new Map();
  for (const g of guesses) {
    if (!g.correct) continue;
    const prev = lastCorrect.get(g.session_id);
    if (!prev || g.created_at > prev) lastCorrect.set(g.session_id, g.created_at);
  }

  const ranked = sessions
    .filter((s) => s.nickname)
    .map((s) => rowFor(s, attemptCounts.get(s.id), lastCorrect.get(s.id)))
    .filter((r) => r.attempts > 0 || r.completed || r.level > 1)
    .sort(compare)
    .map((r, i) => ({ rank: i + 1, ...r }));

  // Session ids never leave the server.
  const publicRow = ({ sessionId: _omit, ...rest }) => rest;
  const result = { entries: ranked.slice(0, limit).map(publicRow), total: ranked.length };

  if (sessionId) {
    const mine = ranked.find((r) => r.sessionId === sessionId);
    const session = sessions.find((s) => s.id === sessionId);
    if (mine) result.you = { ...publicRow(mine), hasNickname: true };
    else if (session) result.you = { ...publicRow(rowFor(session, attemptCounts.get(session.id), lastCorrect.get(session.id))), rank: null, hasNickname: Boolean(session.nickname) };
  }
  return result;
}
