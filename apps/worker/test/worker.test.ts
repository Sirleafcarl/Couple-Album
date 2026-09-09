import { describe, expect, it, vi } from 'vitest';
import { runWorker } from '../src/worker.js';

function job(id: string) {
  return {
    id,
    type: 'process_photo' as const,
    payload: { photoId: `photo-${id}` },
    status: 'running' as const,
    attempts: 1,
    maxAttempts: 5,
    lockedAt: new Date(),
    lockedBy: 'worker',
  };
}

describe('runWorker', () => {
  it('recovers stale jobs before claiming and never overlaps at concurrency one', async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const queue = [job('one'), job('two')];
    let active = 0;
    let maxActive = 0;

    await runWorker({
      workerId: 'worker-a',
      concurrency: 1,
      pollMs: 1,
      staleJobMs: 900_000,
      signal: controller.signal,
      now: () => new Date('2026-09-02T08:00:00.000Z'),
      jobs: {
        recoverStale: vi.fn(async () => { events.push('recover'); return 1; }),
        claimNext: vi.fn(async () => {
          events.push('claim');
          return queue.shift() ?? null;
        }),
      },
      processJob: async (claimed) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        events.push(`process:${claimed.id}`);
        active -= 1;
        if (claimed.id === 'two') controller.abort();
      },
    });

    expect(events[0]).toBe('recover');
    expect(events).toContain('process:one');
    expect(events).toContain('process:two');
    expect(maxActive).toBe(1);
  });

  it('continues after one job fails and waits for active work on shutdown', async () => {
    const controller = new AbortController();
    const queue = [job('bad'), job('good')];
    const processed: string[] = [];
    const errors: string[] = [];

    await runWorker({
      workerId: 'worker-a',
      concurrency: 1,
      pollMs: 1,
      staleJobMs: 1,
      signal: controller.signal,
      now: () => new Date(),
      jobs: {
        recoverStale: vi.fn(async () => 0),
        claimNext: vi.fn(async () => queue.shift() ?? null),
      },
      processJob: async (claimed) => {
        processed.push(claimed.id);
        if (claimed.id === 'bad') throw new Error('already scheduled for retry');
        controller.abort();
      },
      onError: (error) => errors.push((error as Error).message),
    });

    expect(processed).toEqual(['bad', 'good']);
    expect(errors).toEqual(['already scheduled for retry']);
  });
});
