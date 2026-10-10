import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import DwarpalAvatar from '../components/DwarpalAvatar.jsx';
import { api } from '../api.js';
import { storage } from '../storage.js';
import { navigate } from '../router.js';
import { DEFENSES, activeDefenses } from '../defenses.js';

export default function Landing() {
  const [levels, setLevels] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const existing = storage.getSessionId();

  useEffect(() => {
    api.levels().then((r) => setLevels(r.levels), () => setLevels(null));
  }, []);

  async function start(fresh) {
    setError(null);
    if (!fresh && existing) return navigate('/play');
    setStarting(true);
    try {
      storage.clearSession();
      const { sessionId } = await api.createSession();
      storage.setSessionId(sessionId);
      navigate('/play');
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center px-4 py-12 sm:py-20">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <DwarpalAvatar size={120} />
      </motion.div>

      <motion.h1
        className="text-gilded mt-6 text-center font-display text-5xl font-bold sm:text-6xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Dwarpal
      </motion.h1>
      <p className="mt-2 font-display text-sm uppercase tracking-[0.25em] text-mist-300">Keeper of the ancient vault</p>

      <p className="mt-8 max-w-xl text-center text-lg leading-relaxed text-parchment-200">
        At each of five gates, an AI gatekeeper guards a secret password. Persuade, trick or confuse it into
        letting the word slip, then speak the password to open the gate. Every gate adds a new defense.
      </p>

      {levels && (
        <ol className="mt-10 grid w-full grid-cols-5 gap-1.5 sm:gap-2">
          {levels.map((l) => {
            const defs = activeDefenses(l);
            return (
              <li key={l.level} className="rounded-xl border border-vault-700/70 bg-vault-900/70 px-1 py-3 text-center sm:px-3">
                <p className="font-display text-xs text-gold-300 sm:text-base">Gate {l.level}</p>
                <p
                  className="mt-1 text-[10px] leading-snug text-mist-300 sm:text-xs"
                  title={defs.map((d) => d.label).join(', ') || 'No defenses'}
                >
                  {defs.length ? `${defs.length} defense${defs.length > 1 ? 's' : ''}` : 'None'}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      <dl className="mt-6 grid w-full gap-x-6 gap-y-2 text-sm text-mist-300 sm:grid-cols-2">
        {DEFENSES.map((d) => (
          <div key={d.key}>
            <dt className="inline text-parchment-200">{d.label}: </dt>
            <dd className="inline">{d.desc}</dd>
          </div>
        ))}
      </dl>

      <div
        role="note"
        className="mt-10 w-full rounded-xl border border-gold-500/40 bg-gold-500/5 px-5 py-4 text-center text-sm text-parchment-200"
      >
        Your messages are logged anonymously for a study on AI security. Don't enter personal information.
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => start(false)}
          disabled={starting}
          className="rounded-xl bg-gold-500 px-8 py-3 font-display text-lg font-bold tracking-wide text-vault-950 shadow-[0_0_30px_rgb(212_166_74/0.35)] transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300 disabled:opacity-60"
        >
          {starting ? 'Opening…' : existing ? 'Continue your journey' : 'Approach the gate'}
        </button>
        {existing && (
          <button
            type="button"
            onClick={() => start(true)}
            disabled={starting}
            className="text-sm text-mist-300 underline-offset-4 hover:text-parchment-50 hover:underline"
          >
            Start over from Gate 1
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm text-ember-400">
            {error}
          </p>
        )}
      </div>

      <nav aria-label="More" className="mt-12 flex gap-6 text-sm">
        {[
          ['/leaderboard', 'Leaderboard'],
          ['/results', 'Study results'],
        ].map(([to, label]) => (
          <a
            key={to}
            href={to}
            onClick={(e) => {
              e.preventDefault();
              navigate(to);
            }}
            className="text-mist-300 underline-offset-4 hover:text-gold-300 hover:underline"
          >
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
