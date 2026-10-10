import { useEffect, useState } from 'react';

// Tiny pushState router — the app only has a handful of pages.
export function navigate(to, { replace = false } = {}) {
  if (to === window.location.pathname) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return path;
}
