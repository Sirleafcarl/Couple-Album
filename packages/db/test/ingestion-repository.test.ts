import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { createIngestionRepository } from '../src/ingestion-repository.js';
import { albumYearSettings, albums, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createIngestionRepository(database.db);

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

async function createOwner(): Promise<string> {
  const [owner] = await database.db.insert(users).values({
    email: `${randomUUID()}@example.com`,
    displayName: 'Owner',
    passwordHash: 'hash',
  }).returning({ id: users.id });
  if (!owner) throw new Error('Owner fixture was not created');
  return owner.id;
}

describe('ingestion repository', () => {
  it('commits the photo, processing job, and upload state in one transaction', async () => {
    const ownerId = await createOwner();
    const photoId = randomUUID();
    const [upload] = await database.db.insert(uploads).values({
      ownerId,
      originalFilename: 'lake.jpg',
      stagingPath: 'staging/upload.part',
      bytesReceived: 12,
    }).returning({ id: uploads.id });
    if (!upload) throw new Error('Upload fixture was not created');

    const result = await repository.commitUpload({
      uploadId: upload.id,
      photoId,
      ownerId,
      originalPath: `originals/${ownerId}/aa/bb/${photoId}.jpg`,
      originalFilename: 'lake.jpg',
      contentHash: 'a'.repeat(64),
      mimeType: 'image/jpeg',
      sizeBytes: 12,
      now: new Date('2026-09-02T08:00:00.000Z'),
    });

    expect(result.photoId).toBe(photoId);
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(database.db.select().from(photos)).resolves.toEqual([
      expect.objectContaining({ id: photoId, status: 'processing' }),
    ]);
    await expect(database.db.select().from(jobs)).resolves.toEqual([
      expect.objectContaining({
        id: result.jobId,
        type: 'process_photo',
        status: 'queued',
        payload: { photoId },
      }),
    ]);
    const [committedUpload] = await database.db.select().from(uploads).where(eq(uploads.id, upload.id));
    expect(committedUpload).toMatchObject({
      status: 'committed',
      stagingPath: null,
      contentHash: 'a'.repeat(64),
      photoId,
    });
  });

  it('rolls back photo and job inserts when the upload does not exist', async () => {
    const ownerId = await createOwner();
    const photoId = randomUUID();

    await expect(repository.commitUpload({
      uploadId: randomUUID(),
      photoId,
      ownerId,
      originalPath: `originals/${ownerId}/aa/bb/${photoId}.jpg`,
      originalFilename: 'lake.jpg',
      contentHash: 'b'.repeat(64),
      mimeType: 'image/jpeg',
      sizeBytes: 12,
      now: new Date('2026-09-02T08:00:00.000Z'),
    })).rejects.toThrow('Upload was not found');

    expect(await database.db.select().from(photos)).toEqual([]);
    expect(await database.db.select().from(jobs)).toEqual([]);
  });
});
