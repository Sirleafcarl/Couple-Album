import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UploadRepository } from '@memory/db';
import { createLocalMediaStorage } from '@memory/media';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createPhotoUploadService } from '../src/photos/photo-upload-service.js';
import { createUnusedDependencies } from './test-dependencies.js';

const owner = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'alice@example.com',
  displayName: 'Alice',
};
const uploadId = '019cfff0-3e23-7d99-a3df-eabc920fd497';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Operation did not settle')), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

describe('aborted oversized multipart upload', () => {
  it('settles server-side cleanup without leaving a staging file', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'memory-aborted-upload-'));
    roots.push(dataRoot);
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 4, minFreeBytes: 1 });
    await storage.ensureLayout();
    const failure = deferred();
    const uploads: UploadRepository = {
      async createReceiving() {
        return {
          id: uploadId,
          originalFilename: 'large.png',
          status: 'receiving',
          bytesReceived: 0,
          errorCode: null,
          photoId: null,
          createdAt: new Date('2026-09-02T08:00:00.000Z'),
        };
      },
      async recordStaged() {},
      async markFailed() {
        failure.resolve();
      },
      async markDuplicate() {},
      async listForOwner() {
        return [];
      },
    };
    const base = createUnusedDependencies();
    const app = buildApp({
      ...base,
      config: { ...base.config, dataRoot, maxUploadBytes: 4 },
      sessions: {
        ...base.sessions,
        async findActiveByTokenHash() {
          return owner;
        },
      },
      photoUploads: createPhotoUploadService({
        storage,
        uploads,
        photos: { async findDuplicate() { return null; } },
        ingestion: {
          async commitUpload() {
            throw new Error('Oversized input must not reach ingestion');
          },
        },
        clock: () => new Date('2026-09-02T08:00:00.000Z'),
        createId: () => '019cfff0-3e23-7d99-a3df-eabc920fd499',
        reportCleanupError() {},
      }),
    });

    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an IPv4 test server');
    const socket = createConnection({ host: '127.0.0.1', port: address.port });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    socket.write([
      'POST /api/photos/uploads HTTP/1.1',
      `Host: 127.0.0.1:${address.port}`,
      'Origin: http://localhost:5173',
      'Cookie: memory_session=test-token',
      'Content-Type: multipart/form-data; boundary=memory-abort',
      'Content-Length: 100000',
      'Connection: close',
      '',
      '--memory-abort',
      'Content-Disposition: form-data; name="file"; filename="large.png"',
      'Content-Type: image/png',
      '',
      '12345',
    ].join('\r\n'));
    socket.destroy();

    await within(failure.promise, 2_000);
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
    await within(app.close(), 2_000);
  });
});
