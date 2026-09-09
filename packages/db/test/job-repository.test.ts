import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { createJobRepository } from '../src/job-repository.js';
import { albumYearSettings, albums, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createJobRepository(database.db);
const now = new Date('2026-09-02T08:00:00.000Z');

async function resetDatabase(): Promise<void> {
  await database.db.delete(jobs);
  await database.db.delete(uploads);
  await database.db.delete(photos);
  await database.db.delete(albumYearSettings);
  await database.db.delete(albums);
  await database.db.delete(sessions);
  await database.db.delete(users);
}

beforeEach(resetDatabase);

afterAll(async () => {
  await resetDatabase();
  await database.close();
});

async function enqueue(input: { nextRunAt?: Date; maxAttempts?: number } = {}): Promise<string> {
  const [job] = await database.db.insert(jobs).values({
    type: 'process_photo',
    payload: { photoId: randomUUID() },
    nextRunAt: input.nextRunAt ?? now,
    maxAttempts: input.maxAttempts,
  }).returning({ id: jobs.id });
  if (!job) throw new Error('Job fixture was not created');
  return job.id;
}

describe('job repository', () => {
  it('claims queued work exclusively and does not claim future work', async () => {
    await enqueue();
    await enqueue();
    await enqueue({ nextRunAt: new Date('2026-09-02T09:00:00.000Z') });

    const claimed = await Promise.all([
      repository.claimNext('worker-a', now),
      repository.claimNext('worker-b', now),
    ]);

    expect(new Set(claimed.map((job) => job?.id)).size).toBe(2);
    expect(claimed.every((job) => job?.status === 'running' && job.attempts === 1)).toBe(true);
    await expect(repository.claimNext('worker-c', now)).resolves.toBeNull();
  });

  it('backs off retryable failures and makes the final attempt terminal', async () => {
    const id = await enqueue({ maxAttempts: 2 });
    await repository.claimNext('worker-a', now);

    await expect(repository.recordFailure(id, 'decode failed', now)).resolves.toEqual({
      status: 'retry',
      nextRunAt: new Date('2026-09-02T08:00:30.000Z'),
    });
    await repository.claimNext('worker-a', new Date('2026-09-02T08:00:30.000Z'));
    await expect(repository.recordFailure(
      id,
      'decode failed again',
      new Date('2026-09-02T08:00:31.000Z'),
    )).resolves.toEqual({ status: 'failed', nextRunAt: null });
  });

  it('recovers stale running work and completes claimed work', async () => {
    const staleId = await enqueue({ nextRunAt: new Date('2026-09-02T07:00:00.000Z') });
    await repository.claimNext('dead-worker', new Date('2026-09-02T07:00:00.000Z'));

    await expect(repository.recoverStale(now, 900_000)).resolves.toBe(1);
    const [recovered] = await database.db.select().from(jobs).where(eq(jobs.id, staleId));
    expect(recovered).toMatchObject({ status: 'retry', lockedAt: null, lockedBy: null });

    const claimed = await repository.claimNext('worker-a', now);
    if (!claimed) throw new Error('Recovered job was not claimed');
    await repository.complete(claimed.id, now);
    const [completed] = await database.db.select().from(jobs).where(eq(jobs.id, staleId));
    expect(completed).toMatchObject({ status: 'completed', lockedAt: null, lockedBy: null });
  });
});
