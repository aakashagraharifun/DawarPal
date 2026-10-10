import { BusyError } from './errors.js';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Global sliding-window limiter shared by every LLM call (bot, judge, retries).
// Callers are served strictly in FIFO order.
export function createRateLimiter({
  maxPerWindow,
  windowMs = 60_000,
  maxQueue = Infinity,
  now = Date.now,
  sleep = defaultSleep,
}) {
  const stamps = [];
  let tail = Promise.resolve();
  let waiting = 0;

  async function takeSlot() {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length < maxPerWindow) {
        stamps.push(t);
        return;
      }
      await sleep(windowMs - (t - stamps[0]) + 5);
    }
  }

  function acquire() {
    if (waiting >= maxQueue) return Promise.reject(new BusyError('queue_full'));
    waiting++;
    const slot = tail.then(takeSlot).finally(() => {
      waiting--;
    });
    tail = slot.catch(() => {});
    return slot;
  }

  return { acquire, pending: () => waiting };
}
