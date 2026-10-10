import { motion } from 'framer-motion';
import { activeDefenses } from '../defenses.js';

function stateOf(level, current, completed) {
  if (completed || level < current) return 'cleared';
  if (level === current) return 'current';
  return 'locked';
}

const RING = {
  cleared: 'border-jade-500/60 bg-jade-500/15 text-jade-400',
  current: 'border-gold-400 bg-gold-500/20 text-gold-300 shadow-[0_0_18px_rgb(212_166_74/0.45)]',
  locked: 'border-vault-600 bg-vault-850 text-mist-500',
};

// Desktop: vertical list with defense icons. Mobile: compact horizontal strip.
export default function LevelProgress({ levels, current, completed }) {
  return (
    <nav aria-label="Level progress">
      <ol className="flex gap-2 lg:flex-col lg:gap-3">
        {levels.map((info) => {
          const state = stateOf(info.level, current, completed);
          const defenses = activeDefenses(info);
          return (
            <li
              key={info.level}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl border p-2 lg:flex-row lg:items-center lg:gap-3 lg:p-3 ${
                state === 'current' ? 'border-gold-500/50 bg-vault-800/80' : 'border-vault-700/60 bg-vault-900/60'
              }`}
            >
              <motion.span
                layout
                className={`grid size-8 shrink-0 place-items-center rounded-full border font-display text-sm font-bold lg:size-9 ${RING[state]}`}
              >
                {state === 'cleared' ? '✓' : info.level}
              </motion.span>
              {/* Defense names only fit on desktop; the mobile strip shows just the gate number. */}
              <span className="hidden min-w-0 lg:block">
                <span className="block font-display text-sm text-parchment-200">Gate {info.level}</span>
                <span className="block truncate text-[11px] text-mist-300" title={defenses.map((d) => d.label).join(', ')}>
                  {defenses.length ? defenses.map((d) => d.short).join(' · ') : 'No defenses'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
