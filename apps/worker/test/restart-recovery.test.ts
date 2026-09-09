import { randomUUID } from 'node:crypto';
import { readFile, readdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import {
  createDatabase,
  createIngestionRepository,
  createJobRepository,
  createPhotoProcessingRepository,
  createUploadRepository,
  jobs,
  photos,
  uploads,
  users,
} from '@memory/db';
import { createLocalMediaStorage } from '@memory/media';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { processPhotoJob } from '../src/process-photo-job.js';
import { runWorker } from '../src/worker.js';

const enabled = process.env.RUN_RESTART_TESTS === 'true';

describe.runIf(enabled)('worker restart recovery', () => {
  it('recovers a stale claimed job and creates exactly one complete media set', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL
      ?? 'postgres://memory:memory@localhost:38427/memory_test';
    if (!new URL(databaseUrl).pathname.slice(1).endsWith('_test')) {
      throw new Error('Restart recovery requires a database ending in _test');
    }
    const dataRoot = await mkdtemp(join(tmpdir(), 'memory-restart-'));
    const database = createDatabase(databaseUrl);
    const ownerId = randomUUID();
    const photoId = randomUUID();
    const now = new Date('2026-09-02T08:00:00.000Z');

    try {
      await database.db.insert(users).values({
        id: ownerId,
        email: `${ownerId}@restart.test`,
        displayName: 'Restart Test',
        passwordHash: 'not-used',
      });
      const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 10_000_000, minFreeBytes: 1 });
      await storage.ensureLayout();
      const uploadRepository = createUploadRepository(database.db);
      const upload = await uploadRepository.createReceiving({
        ownerId,
        originalFilename: 'landscape.jpg',
        now,
      });
      const original = await readFile(resolve(
        import.meta.dirname,
        '../../../packages/media/test/fixtures/landscape.jpg',
      ));
      const staged = await storage.writeStaging(upload.id, Readable.from([original]));
      const detected = await storage.inspectStaged(staged.stagingPath);
      const originalPath = await storage.commitOriginal({
        stagingPath: staged.stagingPath,
        ownerId,
        photoId,
        extension: detected.extension,
      });
      await createIngestionRepository(database.db).commitUpload({
        uploadId: upload.id,
        photoId,
        ownerId,
        originalPath,
        originalFilename: 'landscape.jpg',
        contentHash: staged.sha256,
        mimeType: detected.mimeType,
        sizeBytes: staged.sizeBytes,
        now,
      });

      const jobRepository = createJobRepository(database.db);
      const crashedClaim = await jobRepository.claimNext('crashed-worker', now);
      expect(crashedClaim).not.toBeNull();

      const restartTime = new Date(now.getTime() + 10_000);
      const shutdown = new AbortController();
      await runWorker({
        workerId: 'restarted-worker',
        concurrency: 1,
        pollMs: 1,
        staleJobMs: 1_000,
        signal: shutdown.signal,
        now: () => restartTime,
        jobs: jobRepository,
        processJob: async (job) => {
          const result = await processPhotoJob(job, {
            processing: createPhotoProcessingRepository(database.db),
            storage,
            now: () => restartTime,
          });
          shutdown.abort();
          return result;
        },
      });

      const [photo] = await database.db.select().from(photos).where(eq(photos.id, photoId));
      expect(photo).toMatchObject({ status: 'ready' });
      expect(photo?.previewPath).toBeTruthy();
      expect(photo?.thumbnailPath).toBeTruthy();
      const files = (await readdir(dataRoot, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile());
      expect(files).toHaveLength(3);
    } finally {
      await database.db.delete(jobs).where(eq(jobs.payload, { photoId }));
      await database.db.delete(uploads).where(eq(uploads.ownerId, ownerId));
      await database.db.delete(photos).where(eq(photos.ownerId, ownerId));
      await database.db.delete(users).where(eq(users.id, ownerId));
      await database.close();
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
