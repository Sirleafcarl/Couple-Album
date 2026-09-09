import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createDatabase,
  createJobRepository,
  createPhotoProcessingRepository,
} from '@memory/db';
import { createLocalMediaStorage } from '@memory/media';
import { parseWorkerConfig } from './config.js';
import { processPhotoJob } from './process-photo-job.js';
import { runWorker } from './worker.js';

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
  const processing = createPhotoProcessingRepository(database.db);
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
      processJob: (job) => processPhotoJob(job, { processing, storage }),
    });
  } finally {
    process.removeListener('SIGINT', requestShutdown);
    process.removeListener('SIGTERM', requestShutdown);
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
