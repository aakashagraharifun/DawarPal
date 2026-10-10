import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import ChatPanel from '../components/ChatPanel.jsx';
import GuessBox from '../components/GuessBox.jsx';
import LevelProgress from '../components/LevelProgress.jsx';
import Celebration from '../components/Celebration.jsx';
import Victory from '../components/Victory.jsx';
import { api } from '../api.js';
import { storage } from '../storage.js';
import { navigate } from '../router.js';
import { activeDefenses } from '../defenses.js';
import { useCountdown } from '../useCountdown.js';
import NavLinks from '../components/NavLinks.jsx';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function Play() {
  const [sessionId, setSessionId] = useState(() => storage.getSessionId());
  const [levels, setLevels] = useState(null);
  const [progress, setProgress] = useState(null); // { level, completed }
  const [history, setHistory] = useState({}); // { [level]: messages[] } — display only
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [celebration, setCelebration] = useState(null); // { level, next: progress }
  const [cooldownMs, setCooldownMs] = useState({ chatMs: 0, guessMs: 0 });
  const [chatReadyAt, setChatReadyAt] = useState(0);
  const [guessReadyAt, setGuessReadyAt] = useState(0);
  const chatCooldown = useCountdown(chatReadyAt);
  const guessCooldown = useCountdown(guessReadyAt);

  // No session → the landing page (which shows the logging notice).
  useEffect(() => {
    if (!sessionId) navigate('/', { replace: true });
  }, [sessionId]);

  const startNewSession = useCallback(async (message) => {
    storage.clearSession();
    const { sessionId: id } = await api.createSession();
    storage.setSessionId(id);
    setNotice(message);
    setSessionId(id);
  }, []);

  // Load level info + progress whenever the session changes.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoadError(null);
    setHistory(storage.getHistory(sessionId));
    Promise.all([api.levels(), api.progress(sessionId)])
      .then(([lv, prog]) => {
        if (cancelled) return;
        setLevels(lv.levels);
        if (lv.cooldowns) setCooldownMs(lv.cooldowns);
        setProgress(prog);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) {
          startNewSession('Your previous game could not be found, so a new one has begun.').catch((e) =>
            setLoadError(e.message),
          );
        } else {
          setLoadError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, startNewSession]);

  const updateHistory = useCallback(
    (level, fn) => {
      setHistory((prev) => {
        const next = { ...prev, [level]: fn(prev[level] ?? []) };
        storage.setHistory(sessionId, next);
        return next;
      });
    },
    [sessionId],
  );

  async function handleSend(text) {
    const level = progress.level;
    const userMsg = { id: uid(), role: 'user', text };
    updateHistory(level, (msgs) => [...msgs, userMsg]);
    setSending(true);
    setChatError(null);
    // The server starts the cooldown when it accepts the message.
    setChatReadyAt(Date.now() + cooldownMs.chatMs);
    try {
      const r = await api.chat(sessionId, text);
      updateHistory(r.level, (msgs) => [...msgs, { id: uid(), role: 'bot', text: r.reply, blockedBy: r.blockedBy }]);
      return true;
    } catch (err) {
      updateHistory(level, (msgs) => msgs.filter((m) => m.id !== userMsg.id));
      if (err.status === 429 && err.body?.retryAfter) setChatReadyAt(Date.now() + err.body.retryAfter * 1000);
      if (err.status === 400) setChatReadyAt(0);
      setChatError({ text: err.message, busy: err.status === 503 || err.status === 429 });
      if (err.status === 409) setProgress((p) => ({ ...p, completed: true }));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleGuess(guess) {
    const level = progress.level;
    setGuessReadyAt(Date.now() + cooldownMs.guessMs);
    let r;
    try {
      r = await api.guess(sessionId, guess);
    } catch (err) {
      if (err.status === 429 && err.body?.retryAfter) setGuessReadyAt(Date.now() + err.body.retryAfter * 1000);
      throw err;
    }
    if (r.correct) {
      setGuessReadyAt(0);
      setChatReadyAt(0);
      setChatError(null);
      setCelebration({ level, next: { level: r.newLevel, completed: r.completed } });
    }
    return r.correct;
  }

  const finishCelebration = useCallback(() => {
    if (celebration) setProgress(celebration.next);
    setCelebration(null);
  }, [celebration]);

  async function newGame() {
    try {
      setProgress(null);
      await startNewSession(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }

  if (loadError) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-ember-400">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl border border-gold-500 px-4 py-2 text-gold-300"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!levels || !progress) {
    return (
      <main className="grid min-h-dvh place-items-center text-mist-300" aria-busy="true">
        Approaching the gate…
      </main>
    );
  }

  const levelInfo = levels.find((l) => l.level === progress.level);
  const defenses = activeDefenses(levelInfo);
  const busy = Boolean(celebration);

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4 lg:h-dvh lg:py-6">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="font-display text-xl font-bold text-gold-300 hover:text-gold-300/80"
        >
          Dwarpal
        </button>
        <div className="flex items-center gap-4">
          {!progress.completed && (
            <p className="hidden text-sm text-mist-300 sm:block">
              Gate <span className="font-semibold text-parchment-50">{progress.level}</span> of {levels.length}
            </p>
          )}
          <NavLinks current="/play" />
        </div>
      </header>

      {notice && (
        <p role="status" className="rounded-xl bg-gold-500/10 px-4 py-2 text-sm text-gold-300">
          {notice}
        </p>
      )}

      <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="lg:overflow-y-auto">
          <LevelProgress levels={levels} current={progress.level} completed={progress.completed} />
        </aside>

        <div className="lg:min-h-0">
          {progress.completed ? (
            <Victory sessionId={sessionId} onNewGame={newGame} />
          ) : (
            <ChatPanel
              levelInfo={levelInfo}
              messages={history[progress.level] ?? []}
              sending={sending}
              error={chatError}
              disabled={busy}
              cooldown={chatCooldown}
              onSend={handleSend}
            />
          )}
        </div>

        {!progress.completed && (
          <aside className="flex flex-col gap-4 lg:overflow-y-auto">
            <GuessBox level={progress.level} disabled={busy} cooldown={guessCooldown} onGuess={handleGuess} />
            <section className="rounded-2xl border border-vault-700/70 bg-vault-900/70 p-4">
              <h2 className="font-display text-sm text-gold-300">Defenses at this gate</h2>
              {defenses.length ? (
                <ul className="mt-3 space-y-3">
                  {defenses.map((d) => (
                    <li key={d.key} className="border-l-2 border-gold-500/40 pl-3 text-sm">
                      <span className="font-medium text-parchment-50">{d.label}</span>
                      <span className="block text-mist-300">{d.desc}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-mist-300">
                  None. Dwarpal knows the password but has no rules about keeping it.
                </p>
              )}
            </section>
          </aside>
        )}
      </div>

      <AnimatePresence>
        {celebration && (
          <Celebration
            key={celebration.level}
            level={celebration.level}
            final={celebration.next.completed}
            onDone={finishCelebration}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
