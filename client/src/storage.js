// localStorage can be unavailable (private mode, blocked storage); every access is guarded.
const SESSION_KEY = 'dwarpal.sessionId';
const historyKey = (sessionId) => `dwarpal.chat.${sessionId}`;
const MAX_MESSAGES_PER_LEVEL = 200;

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Ignore: the game still works, it just won't remember across reloads.
  }
}

export const storage = {
  getSessionId: () => read(SESSION_KEY),
  setSessionId: (id) => write(SESSION_KEY, id),
  clearSession() {
    const id = read(SESSION_KEY);
    if (id) write(historyKey(id), null);
    write(SESSION_KEY, null);
  },

  // Chat history is visual only (the model never sees it): { "1": [msg, ...], ... }
  getHistory(sessionId) {
    try {
      return JSON.parse(read(historyKey(sessionId)) ?? '{}') ?? {};
    } catch {
      return {};
    }
  },
  setHistory(sessionId, history) {
    const trimmed = Object.fromEntries(
      Object.entries(history).map(([level, msgs]) => [level, msgs.slice(-MAX_MESSAGES_PER_LEVEL)]),
    );
    write(historyKey(sessionId), JSON.stringify(trimmed));
  },
};
