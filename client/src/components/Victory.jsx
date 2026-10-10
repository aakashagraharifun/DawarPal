import { motion } from 'framer-motion';
import DwarpalAvatar from './DwarpalAvatar.jsx';
import NicknameForm from './NicknameForm.jsx';
import { navigate } from '../router.js';

export default function Victory({ sessionId, onNewGame }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 rounded-2xl border border-gold-500/40 bg-vault-900/80 px-6 py-12 text-center lg:h-full"
    >
      <DwarpalAvatar size={96} />
      <div>
        <p className="font-display text-sm uppercase tracking-[0.3em] text-gold-400">All five gates</p>
        <h1 className="text-gilded mt-2 font-display text-4xl font-bold sm:text-5xl">The vault is yours</h1>
      </div>
      <p className="max-w-md text-mist-300">
        "Few travelers have talked their way past every one of my defenses. Well played." — Dwarpal
      </p>

      <NicknameForm sessionId={sessionId} onSaved={() => navigate('/leaderboard')} />

      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={() => navigate('/leaderboard')}
          className="text-mist-300 underline-offset-4 hover:text-parchment-50 hover:underline"
        >
          Skip, just show the leaderboard
        </button>
        <button
          type="button"
          onClick={onNewGame}
          className="text-mist-300 underline-offset-4 hover:text-parchment-50 hover:underline"
        >
          Play again
        </button>
      </div>
    </motion.section>
  );
}
