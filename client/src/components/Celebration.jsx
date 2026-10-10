import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

const DURATION_MS = 2800;

// Full-screen "gate opens" moment: doors part, light spills out, sparks fly.
export default function Celebration({ level, final = false, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  const sparks = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 140 + Math.random() * 160;
        return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, delay: 0.5 + Math.random() * 0.3, size: 3 + Math.random() * 4 };
      }),
    [],
  );

  return (
    <motion.div
      role="dialog"
      aria-live="assertive"
      aria-label={`Gate ${level} opened`}
      className="fixed inset-0 z-50 grid cursor-pointer place-items-center overflow-hidden bg-vault-950/90 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      {/* light behind the doors */}
      <motion.div
        className="absolute size-[42rem] rounded-full bg-[radial-gradient(circle,rgb(245_212_138/0.55),rgb(212_166_74/0.15)_40%,transparent_70%)]"
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.35, duration: 1.2, ease: 'easeOut' }}
      />

      {/* doors */}
      <div className="absolute inset-0 flex">
        {[-1, 1].map((dir) => (
          <motion.div
            key={dir}
            className={`h-full w-1/2 border-gold-700/60 bg-linear-to-b from-vault-800 to-vault-900 ${dir < 0 ? 'border-r-2' : 'border-l-2'}`}
            initial={{ x: 0 }}
            animate={{ x: `${dir * 100}%` }}
            transition={{ delay: 0.25, duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
          />
        ))}
      </div>

      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-gold-300"
          style={{ width: s.size, height: s.size }}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: s.x, y: s.y, opacity: [0, 1, 0] }}
          transition={{ delay: s.delay, duration: 1.3, ease: 'easeOut' }}
        />
      ))}

      <motion.div
        className="relative px-6 text-center"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
      >
        <p className="font-display text-sm uppercase tracking-[0.3em] text-gold-400">
          {final ? 'The vault is open' : 'The gate opens'}
        </p>
        <h2 className="text-gilded mt-2 font-display text-5xl font-bold sm:text-6xl">Gate {level}</h2>
        <p className="mt-3 text-mist-300">{final ? 'You have passed every gate.' : `Onward to Gate ${level + 1}…`}</p>
      </motion.div>
    </motion.div>
  );
}
