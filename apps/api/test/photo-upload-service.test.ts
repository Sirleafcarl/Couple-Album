import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type {
  CommitUploadInput,
  IngestionRepository,
  PhotoRepository,
  UploadHistoryItem,
  UploadRepository,
} from '@memory/db';
import { createLocalMediaStorage, type MediaStorage } from '@memory/media';
import { afterEach, describe, expect, it } from 'vitest';
import { createPhotoUploadService, sanitizeOriginalFilename } from '../src/photos/photo-upload-service.js';

const ownerId = '10000000-0000-4000-8000-000000000001';
const photoId = '019cfff0-3e23-7d99-a3df-eabc920fd499';
const uploadId = '019cfff0-3e23-7d99-a3df-eabc920fd497';
const now = new Date('2026-09-02T08:00:00.000Z');
const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'memory-upload-service-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

type Fakes = {
  uploads: UploadRepository;
  photos: Pick<PhotoRepository, 'findDuplicate'>;
  ingestion: IngestionRepository;
  uploadState: UploadHistoryItem;
  getCommit(): CommitUploadInput | null;
};

function createFakes(input: {
  duplicatePhotoId?: string;
  ingestionError?: Error;
} = {}): Fakes {
  let commit: CommitUploadInput | null = null;
  const uploadState: UploadHistoryItem = {
    id: uploadId,
    originalFilename: 'photo.png',
    status: 'receiving',
    bytesReceived: 0,
    errorCode: null,
    photoId: null,
    createdAt: now,
  };
  const uploads: UploadRepository = {
    async createReceiving(value) {
      uploadState.originalFilename = value.originalFilename;
      return { ...uploadState };
    },
    async recordStaged(value) {
      uploadState.bytesReceived = value.bytesReceived;
    },
    async markFailed(value) {
      uploadState.status = 'failed';
      uploadState.errorCode = value.errorCode;
    },
    async markDuplicate(value) {
      uploadState.status = 'duplicate';
      uploadState.bytesReceived = value.bytesReceived;
      uploadState.errorCode = 'DUPLICATE_PHOTO';
    },
    async listForOwner() {
      return [{ ...uploadState }];
    },
  };
  return {
    uploads,
    photos: {
      async findDuplicate() {
        return input.duplicatePhotoId ? { id: input.duplicatePhotoId } : null;
      },
    },
    ingestion: {
      async commitUpload(value) {
        if (input.ingestionError) throw input.ingestionError;
        commit = value;
        uploadState.status = 'committed';
        uploadState.photoId = value.photoId;
        return { photoId: value.photoId, jobId: '019cfff0-3e23-7d99-a3df-eabc920fd496' };
      },
    },
    uploadState,
    getCommit: () => commit,
  };
}

async function createFixture(input: {
  duplicatePhotoId?: string;
  ingestionError?: Error;
  minFreeBytes?: number;
  storageDecorator?: (storage: MediaStorage) => MediaStorage;
} = {}) {
  const dataRoot = await temporaryRoot();
  const fakes = createFakes(input);
  const baseStorage = createLocalMediaStorage({
    dataRoot,
    maxUploadBytes: 1024,
    minFreeBytes: input.minFreeBytes ?? 1,
  });
  await baseStorage.ensureLayout();
  const storage = input.storageDecorator?.(baseStorage) ?? baseStorage;
  const service = createPhotoUploadService({
    storage,
    photos: fakes.photos,
    uploads: fakes.uploads,
    ingestion: fakes.ingestion,
    clock: () => now,
    createId: () => photoId,
    reportCleanupError() {},
  });
  return { dataRoot, fakes, service };
}

describe('photo upload service', () => {
  it('sanitizes the client filename without discarding its useful name', () => {
    expect(sanitizeOriginalFilename('../../夏天\0\n照片.png')).toBe('夏天照片.png');
    expect(sanitizeOriginalFilename('   ')).toBe('unnamed-image');
  });

  it('commits a validated original and queues processing', async () => {
    const { dataRoot, fakes, service } = await createFixture();

    const result = await service.upload({
      ownerId,
      originalFilename: '../../photo.png',
      source: Readable.from([pngBytes]),
      allowDuplicate: false,
    });

    expect(result).toEqual({ uploadId, photoId, status: 'processing' });
    expect(fakes.getCommit()).toEqual(expect.objectContaining({
      uploadId,
      photoId,
      ownerId,
      originalFilename: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: pngBytes.byteLength,
    }));
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
    expect((await readdir(join(dataRoot, 'originals'), { recursive: true })).some(
      (entry) => entry.endsWith(`${photoId}.png`),
    )).toBe(true);
  });

  it('removes staging and records a conflict for a default duplicate', async () => {
    const existingPhotoId = '019cfff0-3e23-7d99-a3df-eabc920fd488';
    const { dataRoot, fakes, service } = await createFixture({ duplicatePhotoId: existingPhotoId });

    await expect(service.upload({
      ownerId,
      originalFilename: 'copy.png',
      source: Readable.from([pngBytes]),
      allowDuplicate: false,
    })).rejects.toMatchObject({ code: 'DUPLICATE_PHOTO', statusCode: 409, existingPhotoId });
    expect(fakes.uploadState.status).toBe('duplicate');
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
  });

  it('keeps a duplicate only after the caller explicitly allows it', async () => {
    const { fakes, service } = await createFixture({
      duplicatePhotoId: '019cfff0-3e23-7d99-a3df-eabc920fd488',
    });

    await expect(service.upload({
      ownerId,
      originalFilename: 'copy.png',
      source: Readable.from([pngBytes]),
      allowDuplicate: true,
    })).resolves.toMatchObject({ photoId, status: 'processing' });
    expect(fakes.getCommit()).not.toBeNull();
  });

  it('records capacity failures without leaving staging bytes', async () => {
    const { dataRoot, fakes, service } = await createFixture({
      minFreeBytes: Number.MAX_SAFE_INTEGER,
    });

    await expect(service.upload({
      ownerId,
      originalFilename: 'large.png',
      source: Readable.from([pngBytes]),
      allowDuplicate: false,
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_STORAGE', statusCode: 507 });
    expect(fakes.uploadState).toMatchObject({ status: 'failed', errorCode: 'INSUFFICIENT_STORAGE' });
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
  });

  it.each([
    { name: 'empty input', bytes: Buffer.alloc(0), code: 'EMPTY_UPLOAD', statusCode: 400 },
    { name: 'corrupt input', bytes: Buffer.from('not an image'), code: 'UNSUPPORTED_IMAGE', statusCode: 415 },
  ])('records $name as a terminal validation failure', async ({ bytes, code, statusCode }) => {
    const { dataRoot, fakes, service } = await createFixture();

    await expect(service.upload({
      ownerId,
      originalFilename: 'broken.jpg',
      source: Readable.from([bytes]),
      allowDuplicate: false,
    })).rejects.toMatchObject({ code, statusCode });
    expect(fakes.uploadState).toMatchObject({ status: 'failed', errorCode: code });
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
  });

  it('records a rename failure and removes the staged file', async () => {
    const { dataRoot, fakes, service } = await createFixture({
      storageDecorator(storage) {
        return {
          ...storage,
          async commitOriginal() {
            throw new Error('rename failed');
          },
        };
      },
    });

    await expect(service.upload({
      ownerId,
      originalFilename: 'photo.png',
      source: Readable.from([pngBytes]),
      allowDuplicate: false,
    })).rejects.toMatchObject({ code: 'UPLOAD_UNAVAILABLE', statusCode: 503 });
    expect(fakes.uploadState.status).toBe('failed');
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
  });

  it('does not mask the upload error when staging cleanup also fails', async () => {
    const { fakes, service } = await createFixture({
      storageDecorator(storage) {
        return {
          ...storage,
          async removeIfPresent() {
            throw new Error('cleanup failed');
          },
        };
      },
    });

    await expect(service.upload({
      ownerId,
      originalFilename: 'broken.jpg',
      source: Readable.from([Buffer.from('not an image')]),
      allowDuplicate: false,
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE', statusCode: 415 });
    expect(fakes.uploadState).toMatchObject({
      status: 'failed',
      errorCode: 'UNSUPPORTED_IMAGE',
    });
  });

  it('moves the original back before cleaning up a failed database commit', async () => {
    const { dataRoot, fakes, service } = await createFixture({
      ingestionError: new Error('database unavailable'),
    });

    await expect(service.upload({
      ownerId,
      originalFilename: 'photo.png',
      source: Readable.from([pngBytes]),
      allowDuplicate: false,
    })).rejects.toMatchObject({ code: 'UPLOAD_UNAVAILABLE', statusCode: 503 });
    expect(fakes.uploadState.status).toBe('failed');
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
    expect((await readdir(join(dataRoot, 'originals'), { recursive: true })).some(
      (entry) => entry.endsWith('.png'),
    )).toBe(false);
  });
});
