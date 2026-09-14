import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createDatabase,
  createJobRepository,
  createPhotoProcessingRepository,
  createPhotoTrashRepository,
} from '@memory/db';
import { createLocalMediaStorage } from '@memory/media';
import { parseWorkerConfig } from './config.js';
import { processPhotoJob } from './process-photo-job.js';
import { runWorker } from './worker.js';
import { removeTrashedPhotoFiles } from './photo-trash-cleanup.js';

async function main(): Promise<void> {
  const config = parseWorkerConfig(process.env);
  const database = createDatabase(config.databaseUrl);
  const storage = createLocalMediaStorage({
    dataRoot: config.dataRoot,
    maxUploadBytes: 104_857_600,
    minFreeBytes: 1_073_741_824,
  });
  await storage.ensureLayout();

  const jobs = createJobRepository(database.db);
  const trash = createPhotoTrashRepository(database.db);
  let cleanup: Promise<unknown> | undefined;
  const cleanTrash = () => {
    if (cleanup) return;
    cleanup = trash.purgeExpired(new Date(), photo => removeTrashedPhotoFiles(photo, storage))
      .catch(() => { console.error('Trash cleanup failed; retained records will be retried.'); })
      .finally(() => { cleanup = undefined; });
  };
  const cleanupTimer = setInterval(cleanTrash, 60_000);
  cleanupTimer.unref();
  cleanTrash();
  const shutdown = new AbortController();
  const requestShutdown = () => shutdown.abort();
  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);

  try {
    await runWorker({
      workerId: `${hostname()}:${process.pid}:${randomUUID()}`,
      concurrency: config.concurrency,
      pollMs: config.pollMs,
      staleJobMs: config.staleJobMs,
      signal: shutdown.signal,
      jobs,
      processJob: (job) => trash.runProcessing(job.payload.photoId, job.id, transaction =>
        processPhotoJob(job, { processing: createPhotoProcessingRepository(transaction), storage })),
    });
  } finally {
    clearInterval(cleanupTimer);
    await cleanup;
    process.removeListener('SIGINT', requestShutdown);
    process.removeListener('SIGTERM', requestShutdown);
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
