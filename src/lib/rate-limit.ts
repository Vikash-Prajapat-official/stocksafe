// Small in-memory failure limiter (sliding window). Per process: resets on restart,
// which is acceptable for a single app container (see DECISIONS.md).

export type Limiter = {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
  reset(key: string): void;
};

const MAX_KEYS = 10_000;

export function createLimiter(opts: {
  max: number;
  windowMs: number;
  now?: () => number;
}): Limiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();

  const live = (key: string): number[] => {
    const cutoff = now() - opts.windowMs;
    const arr = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length) hits.set(key, arr);
    else hits.delete(key);
    return arr;
  };

  return {
    isBlocked: (key) => live(key).length >= opts.max,
    recordFailure(key) {
      const arr = live(key);
      arr.push(now());
      hits.set(key, arr);
      if (hits.size > MAX_KEYS) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
    },
    reset: (key) => void hits.delete(key),
  };
}
