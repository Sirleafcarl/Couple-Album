import type { SessionRepository } from '@memory/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSessionCleanup } from '../src/auth/session-cleanup.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('startSessionCleanup', () => {
  it('deletes expired sessions once per scheduled run and can be stopped', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-02T00:00:00Z');
    const cleanupTimes: Date[] = [];
    const sessions: SessionRepository = {
      async create() {
        throw new Error('not used');
      },
      async findActiveByTokenHash() {
        return null;
      },
      async deleteByTokenHash() {
        return undefined;
      },
      async deleteExpired(currentTime) {
        cleanupTimes.push(currentTime);
        return 0;
      },
    };

    const stop = startSessionCleanup(sessions, () => now, 1_000);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(cleanupTimes).toEqual([now, now]);
    stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cleanupTimes).toHaveLength(2);
  });
});
