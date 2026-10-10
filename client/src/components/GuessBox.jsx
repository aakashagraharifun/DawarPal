import { useEffect, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

export default function GuessBox({ level, disabled, cooldown = 0, onGuess }) {
  const [guess, setGuess] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null); // { kind: 'wrong' | 'error', text }
  const shake = useAnimationControls();

  useEffect(() => {
    setGuess('');
    setFeedback(null);
  }, [level]);

  async function submit(e) {
    e.preventDefault();
    const value = guess.trim();
    if (!value || pending || disabled || cooldown > 0) return;
    setPending(true);
    setFeedback(null);
    try {
      const correct = await onGuess(value);
      if (!correct) {
        setFeedback({ kind: 'wrong', text: 'The gate stays shut. That is not the word.' });
        shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
      }
    } catch (err) {
      setFeedback({ kind: 'error', text: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <motion.form
      animate={shake}
      onSubmit={submit}
      className="rounded-2xl border border-gold-500/30 bg-vault-900/80 p-4 shadow-[0_0_40px_rgb(212_166_74/0.06)]"
    >
      <label htmlFor="guess-input" className="block font-display text-base text-gold-300">
        Speak the password
      </label>
      <p className="mt-0.5 text-xs text-mist-300">Think you know it? Say it here to open Gate {level}.</p>
      <div className="mt-3 flex gap-2">
        <input
          id="guess-input"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          maxLength={100}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          placeholder="password"
          className="h-11 min-w-0 flex-1 rounded-xl border border-vault-600 bg-vault-850 px-3.5 font-display tracking-wider text-parchment-50 placeholder:font-sans placeholder:tracking-normal placeholder:text-mist-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!guess.trim() || pending || disabled || cooldown > 0}
          aria-label={cooldown > 0 ? `Guess available in ${cooldown} seconds` : 'Open the gate'}
          className="h-11 min-w-16 shrink-0 rounded-xl border border-gold-500 bg-transparent px-4 font-semibold tabular-nums text-gold-300 transition hover:bg-gold-500 hover:text-vault-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '…' : cooldown > 0 ? `${cooldown}s` : 'Open'}
        </button>
      </div>
      {feedback && (
        <p role="status" className={`mt-2 text-sm ${feedback.kind === 'wrong' ? 'text-ember-400' : 'text-gold-300'}`}>
          {feedback.text}
        </p>
      )}
    </motion.form>
  );
}
