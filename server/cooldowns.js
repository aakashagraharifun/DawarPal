// Per-key cooldown tracker ("1 chat per 8 s per session"). In memory: assumes a single
// server instance, which is fine for this study.
export function createCooldowns({ now = Date.now, sweepMs = 10 * 60_000 } = {}) {
  const last = new Map();

  const sweep = setInterval(() => {
    const cutoff = now() - sweepMs;
    for (const [key, t] of last) if (t < cutoff) last.delete(key);
  }, sweepMs);
  sweep.unref?.();

  return {
    // Returns 0 and starts the cooldown if allowed, else the seconds left to wait.
    take(key, ms) {
      if (!ms) return 0;
      const t = now();
      const prev = last.get(key);
      if (prev !== undefined && t - prev < ms) return Math.max(1, Math.ceil((ms - (t - prev)) / 1000));
      last.set(key, t);
      return 0;
    },
  };
}
