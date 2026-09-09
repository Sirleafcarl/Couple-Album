import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { createJobRepository } from '../src/job-repository.js';
import { createPhotoProcessingRepository } from '../src/photo-processing-repository.js';
import { albumYearSettings, albums, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createPhotoProcessingRepository(database.db);
const jobRepository = createJobRepository(database.db);
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

async function createFixture(maxAttempts = 5) {
  const ownerId = randomUUID();
  const photoId = randomUUID();
  await database.db.insert(users).values({
    id: ownerId,
    email: `${ownerId}@example.com`,
    displayName: 'Owner',
    passwordHash: 'hash',
  });
  await database.db.insert(photos).values({
    id: photoId,
    ownerId,
    originalPath: `originals/${ownerId}/${photoId}.jpg`,
    originalFilename: 'photo.jpg',
    contentHash: 'a'.repeat(64),
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    sortAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const [job] = await database.db.insert(jobs).values({
    type: 'process_photo',
    payload: { photoId },
    maxAttempts,
    nextRunAt: now,
  }).returning({ id: jobs.id });
  if (!job) throw new Error('Job fixture was not created');
  const claimed = await jobRepository.claimNext('worker-a', now);
  if (!claimed) throw new Error('Job fixture was not claimed');
  return { ownerId, photoId, jobId: job.id };
}

describe('photo processing repository', () => {
  it('marks the photo ready and job complete in one transaction', async () => {
    const fixture = await createFixture();
    const capturedAt = new Date('2026-08-01T08:00:00.000Z');

    await repository.complete({
      ...fixture,
      previewPath: 'previews/photo.webp',
      thumbnailPath: 'thumbnails/photo.webp',
      width: 1200,
      height: 800,
      capturedAt,
      sortAt: capturedAt,
      now,
    });

    const [photo] = await database.db.select().from(photos).where(eq(photos.id, fixture.photoId));
    const [job] = await database.db.select().from(jobs).where(eq(jobs.id, fixture.jobId));
    expect(photo).toMatchObject({ status: 'ready', width: 1200, height: 800, capturedAt });
    expect(job).toMatchObject({ status: 'completed', lockedAt: null, lockedBy: null });
  });

  it('atomically marks the final job and photo failed with a stable code', async () => {
    const fixture = await createFixture(1);

    await expect(repository.recordFailure({
      ...fixture,
      failureCode: 'INVALID_IMAGE',
      error: 'decode failed',
      now,
    })).resolves.toEqual({ status: 'failed', nextRunAt: null });

    const [photo] = await database.db.select().from(photos).where(eq(photos.id, fixture.photoId));
    const [job] = await database.db.select().from(jobs).where(eq(jobs.id, fixture.jobId));
    expect(photo).toMatchObject({ status: 'failed', failureCode: 'INVALID_IMAGE' });
    expect(job).toMatchObject({ status: 'failed', lastError: 'decode failed' });
  });

  it('rolls back the ready photo update when the running job is absent', async () => {
    const fixture = await createFixture();

    await expect(repository.complete({
      ...fixture,
      jobId: randomUUID(),
      previewPath: 'previews/photo.webp',
      thumbnailPath: 'thumbnails/photo.webp',
      width: 1200,
      height: 800,
      capturedAt: null,
      sortAt: now,
      now,
    })).rejects.toThrow('Running job was not found');

    const [photo] = await database.db.select().from(photos).where(eq(photos.id, fixture.photoId));
    expect(photo).toMatchObject({ status: 'processing', previewPath: null, thumbnailPath: null });
  });
});
