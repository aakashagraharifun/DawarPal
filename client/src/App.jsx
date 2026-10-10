import { useEffect } from 'react';
import { usePath } from './router.js';
import Landing from './pages/Landing.jsx';
import Play from './pages/Play.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Results from './pages/Results.jsx';

const PAGES = {
  '/play': Play,
  '/leaderboard': Leaderboard,
  '/results': Results,
};

export default function App() {
  const path = usePath();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  const Page = PAGES[path] ?? Landing;
  return <Page />;
}
