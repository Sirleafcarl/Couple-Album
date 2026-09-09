import type { AppDependencies } from '../src/app.js';

export function createUnusedDependencies(): AppDependencies {
  return {
    config: {
      databaseUrl: 'postgres://unused',
      apiHost: '127.0.0.1',
      apiPort: 23001,
      appOrigin: 'http://localhost:5173',
      sessionCookieSecure: false,
      dataRoot: './data-test',
      maxUploadBytes: 104_857_600,
      minFreeBytes: 1_073_741_824,
      imageWorkerConcurrency: 1,
      imageWorkerPollMs: 1_000,
      staleJobMs: 900_000,
      stagingTtlMs: 86_400_000,
    },
    users: {
      async create() {
        throw new Error('not used');
      },
      async findCredentialsByEmail() {
        return null;
      },
      async findById() {
        return null;
      },
      async countActive() {
        return 0;
      },
    },
    sessions: {
      async create() {
        throw new Error('not used');
      },
      async findActiveByTokenHash() {
        return null;
      },
      async deleteByTokenHash() {
        return undefined;
      },
      async deleteExpired() {
        return 0;
      },
    },
    photoUploads: {
      async upload() {
        throw new Error('not used');
      },
    },
    photos: {
      async findDuplicate() { return null; },
      async list() { return { items: [], nextCursor: null }; },
      async findMediaById() { return null; },
    },
    uploads: {
      async createReceiving() { throw new Error('not used'); },
      async recordStaged() {},
      async markFailed() {},
      async markDuplicate() {},
      async listForOwner() { return []; },
    },
    albums: {
      async findActiveById() { return null; },
      async listActive() { return []; },
      async create() { throw new Error('not used'); },
      async update() { return { kind: 'not-found' }; },
    },
    albumYearSettings: {
      async list() { return []; },
      async set() { throw new Error('not used'); },
    },
    albumPhotos: {
      async get() { return null; },
      async add() { return { kind: 'not-found' }; },
      async remove() { return { kind: 'not-found' }; },
      async move() { return { kind: 'not-found' }; },
      async setLayout() { return { kind: 'not-found' }; },
    },
    media: {
      createReadStream() { throw new Error('not used'); },
    },
  };
}
