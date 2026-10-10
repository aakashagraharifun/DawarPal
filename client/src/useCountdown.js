import { useEffect, useState } from 'react';

// Seconds remaining until `readyAt` (ms timestamp); re-renders while counting down.
export function useCountdown(readyAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!readyAt || readyAt <= Date.now()) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= readyAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [readyAt]);
  return readyAt ? Math.max(0, Math.ceil((readyAt - now) / 1000)) : 0;
}
