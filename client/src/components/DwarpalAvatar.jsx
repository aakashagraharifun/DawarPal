import { motion } from 'framer-motion';
import { useId } from 'react';

// A hooded stone guardian with glowing eyes. `thinking` makes the eyes pulse.
export default function DwarpalAvatar({ size = 48, thinking = false, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Dwarpal, the gatekeeper"
    >
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3d3559" />
          <stop offset="100%" stopColor="#12101b" />
        </radialGradient>
        <filter id={`glow-${id}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="50" cy="50" r="47" fill={`url(#bg-${id})`} stroke="#d4a64a" strokeOpacity="0.7" strokeWidth="2" />
      {/* hood */}
      <path
        d="M50 13C29 13 20 33 20 52v30c9-5.5 19-8 30-8s21 2.5 30 8V52c0-19-9-39-30-39z"
        fill="#0a0910"
        stroke="#d4a64a"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      {/* face in shadow */}
      <ellipse cx="50" cy="53" rx="18" ry="21" fill="#05040a" />
      {/* brow gem */}
      <path d="M50 31l3.5 4-3.5 4-3.5-4z" fill="#5fd3a8" filter={`url(#glow-${id})`} />
      {/* eyes */}
      <motion.g
        filter={`url(#glow-${id})`}
        animate={thinking ? { opacity: [1, 0.35, 1] } : { opacity: 1, scaleY: [1, 1, 0.1, 1] }}
        transition={
          thinking
            ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 5, times: [0, 0.92, 0.96, 1], repeat: Infinity }
        }
      >
        <ellipse cx="42" cy="50" rx="4.5" ry="2.3" fill="#f5d48a" />
        <ellipse cx="58" cy="50" rx="4.5" ry="2.3" fill="#f5d48a" />
      </motion.g>
      {/* beard runes */}
      <path d="M42 64q8 6 16 0M45 69q5 3 10 0" stroke="#d4a64a" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
