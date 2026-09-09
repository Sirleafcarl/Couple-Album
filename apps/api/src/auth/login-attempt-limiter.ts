export type LoginAttemptLimiter = {
  isBlocked(key: string, now: Date): boolean;
  recordFailure(key: string, now: Date): void;
  clear(key: string): void;
};

export function createLoginAttemptLimiter(
  limit = 5,
  windowMs = 15 * 60 * 1000,
): LoginAttemptLimiter {
  const entries = new Map<string, { failures: number; expiresAt: number }>();

  function activeEntry(key: string, now: Date) {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= now.getTime()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked(key, now) {
      return (activeEntry(key, now)?.failures ?? 0) >= limit;
    },

    recordFailure(key, now) {
      const entry = activeEntry(key, now);
      if (entry) {
        entry.failures += 1;
      } else {
        entries.set(key, {
          failures: 1,
          expiresAt: now.getTime() + windowMs,
        });
      }
    },

    clear(key) {
      entries.delete(key);
    },
  };
}
