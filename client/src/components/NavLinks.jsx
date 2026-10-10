import { navigate } from '../router.js';

const LINKS = [
  { to: '/play', label: 'Play' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/results', label: 'Results' },
];

export default function NavLinks({ current }) {
  return (
    <nav aria-label="Main" className="flex gap-1 text-sm">
      {LINKS.map((l) => (
        <a
          key={l.to}
          href={l.to}
          aria-current={current === l.to ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(l.to);
          }}
          className={`rounded-lg px-2.5 py-1.5 transition ${
            current === l.to ? 'bg-vault-800 text-gold-300' : 'text-mist-300 hover:bg-vault-850 hover:text-parchment-50'
          }`}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
