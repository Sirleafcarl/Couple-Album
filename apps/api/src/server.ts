import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  createDatabase,
  createAlbumRepository,
  createAlbumPhotoRepository,
  createAlbumYearSettingsRepository,
  createIngestionRepository,
  createPhotoRepository,
  createPhotoTrashRepository,
  createSessionRepository,
  createUploadRepository,
  createUserRepository,
} from '@memory/db';
import { createLocalMediaStorage } from '@memory/media';
import { buildApp } from './app.js';
import { startSessionCleanup } from './auth/session-cleanup.js';
import { parseConfig } from './config.js';
import { createPhotoUploadService } from './photos/photo-upload-service.js';

const config = parseConfig(process.env);
const database = createDatabase(config.databaseUrl);
const sessions = createSessionRepository(database.db);
const storage = createLocalMediaStorage({
  dataRoot: resolve(config.dataRoot),
  maxUploadBytes: config.maxUploadBytes,
  minFreeBytes: config.minFreeBytes,
});
await storage.ensureLayout();
const app = buildApp({
  config,
  users: createUserRepository(database.db),
  sessions,
  photos: createPhotoRepository(database.db),
  trash: createPhotoTrashRepository(database.db),
  uploads: createUploadRepository(database.db),
  albums: createAlbumRepository(database.db),
  albumPhotos: createAlbumPhotoRepository(database.db),
  albumYearSettings: createAlbumYearSettingsRepository(database.db),
  media: storage,
  photoUploads: createPhotoUploadService({
    storage,
    photos: createPhotoRepository(database.db),
    uploads: createUploadRepository(database.db),
    ingestion: createIngestionRepository(database.db),
    clock: () => new Date(),
    createId: randomUUID,
    reportCleanupError(error) {
      console.error('Photo upload cleanup failed', error);
    },
  }),
});
const stopSessionCleanup = startSessionCleanup(sessions);

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  stopSessionCleanup();
  await app.close();
  await database.close();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown();
  });
}

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
} catch (error) {
  await shutdown();
  throw error;
}
