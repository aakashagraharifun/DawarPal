import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import NavLinks from '../components/NavLinks.jsx';
import NicknameForm from '../components/NicknameForm.jsx';
import { api } from '../api.js';
import { storage } from '../storage.js';
import { navigate } from '../router.js';

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const reached = (e) => (e.completed ? 'All 5' : `Gate ${e.level}`);
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const sessionId = storage.getSessionId();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.leaderboard(sessionId).then(setData, (err) => setError(err.message));
  }, [sessionId]);

  useEffect(load, [load]);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-6">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => navigate('/')} className="font-display text-xl font-bold text-gold-300">
          Dwarpal
        </button>
        <NavLinks current="/leaderboard" />
      </header>

      <h1 className="mt-10 text-center font-display text-4xl font-bold text-gold-300">Leaderboard</h1>
      <p className="mt-2 text-center text-sm text-mist-300">
        Ranked by highest gate reached, then fewest messages, then fastest.
      </p>

      {error && (
        <p role="alert" className="mt-8 text-center text-ember-400">
          {error}
        </p>
      )}

      {data?.you && !data.you.hasNickname && (
        <section className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-gold-500/30 bg-vault-900/80 p-5">
          <p className="text-sm text-parchment-200">
            You've reached <span className="font-semibold text-gold-300">{reached(data.you)}</span> with{' '}
            {data.you.attempts} message{data.you.attempts === 1 ? '' : 's'}. Add your name to the board:
          </p>
          <NicknameForm sessionId={sessionId} onSaved={load} cta="Add me" />
        </section>
      )}

      {data && (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-vault-700/70 bg-vault-900/70">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Top players</caption>
            <thead className="border-b border-vault-700/70 text-xs uppercase tracking-wider text-mist-300">
              <tr>
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">Nickname</th>
                <th scope="col" className="px-4 py-3">Reached</th>
                <th scope="col" className="px-4 py-3 text-right">Messages</th>
                <th scope="col" className="px-4 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-mist-300">
                    No one has claimed a place yet. Be the first.
                  </td>
                </tr>
              )}
              {data.entries.map((e, i) => {
                const isYou = data.you?.hasNickname && data.you.rank === e.rank;
                return (
                  <motion.tr
                    key={e.rank}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                    className={`border-b border-vault-800 last:border-0 ${isYou ? 'bg-gold-500/10' : ''}`}
                  >
                    <td className="px-4 py-3 tabular-nums text-mist-300">{MEDALS[e.rank - 1] ?? e.rank}</td>
                    <td className="px-4 py-3 font-medium text-parchment-50">
                      {e.nickname}
                      {isYou && <span className="ml-2 text-xs text-gold-300">(you)</span>}
                    </td>
                    <td className={`px-4 py-3 ${e.completed ? 'text-jade-400' : 'text-parchment-200'}`}>{reached(e)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.attempts}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-mist-300">{formatDuration(e.seconds)}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data?.you?.hasNickname && data.you.rank > data.entries.length && (
        <p className="mt-4 text-center text-sm text-mist-300">
          You ({data.you.nickname}) are #{data.you.rank} of {data.total}.
        </p>
      )}
    </main>
  );
}
