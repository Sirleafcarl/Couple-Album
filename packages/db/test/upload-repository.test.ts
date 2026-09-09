import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { albumYearSettings, albums, jobs, photos, sessions, uploads, users } from '../src/schema.js';
import { createUploadRepository } from '../src/upload-repository.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createUploadRepository(database.db);

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

describe('upload repository', () => {
  it('records receiving progress and a terminal failure', async () => {
    const ownerId = await createOwner();
    const upload = await repository.createReceiving({
      ownerId,
      originalFilename: 'trip.jpg',
      now: new Date('2026-09-02T08:00:00.000Z'),
    });

    await repository.recordStaged({
      id: upload.id,
      ownerId,
      stagingPath: `staging/${upload.id}.part`,
      bytesReceived: 2048,
      contentHash: 'a'.repeat(64),
      now: new Date('2026-09-02T08:01:00.000Z'),
    });
    await repository.markFailed({
      id: upload.id,
      ownerId,
      errorCode: 'UNSUPPORTED_IMAGE',
      now: new Date('2026-09-02T08:02:00.000Z'),
    });

    await expect(repository.listForOwner(ownerId, 40)).resolves.toEqual([
      expect.objectContaining({
        id: upload.id,
        status: 'failed',
        bytesReceived: 2048,
        errorCode: 'UNSUPPORTED_IMAGE',
      }),
    ]);
  });

  it('keeps upload history private to its owner and marks duplicates', async () => {
    const firstOwner = await createOwner();
    const secondOwner = await createOwner();
    const first = await repository.createReceiving({
      ownerId: firstOwner,
      originalFilename: 'first.jpg',
      now: new Date('2026-09-02T08:00:00.000Z'),
    });
    await repository.createReceiving({
      ownerId: secondOwner,
      originalFilename: 'second.jpg',
      now: new Date('2026-09-02T09:00:00.000Z'),
    });
    await repository.markDuplicate({
      id: first.id,
      ownerId: firstOwner,
      bytesReceived: 1024,
      contentHash: 'b'.repeat(64),
      now: new Date('2026-09-02T08:01:00.000Z'),
    });

    const history = await repository.listForOwner(firstOwner, 40);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: first.id, status: 'duplicate' });
  });
});
