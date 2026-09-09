import { Readable } from 'node:stream';
import type { PhotoProcessingRepository } from '@memory/db';
import {
  ImageProcessingError,
  type ProcessImageInput,
  type ProcessedImage,
} from '@memory/media';
import { describe, expect, it, vi } from 'vitest';
import { processPhotoJob } from '../src/process-photo-job.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const photoId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-09-02T08:00:00.000Z');
const createdAt = new Date('2026-09-01T08:00:00.000Z');
const capturedAt = new Date('2026-08-01T08:00:00.000Z');
const claimedJob = {
  id: '33333333-3333-4333-8333-333333333333',
  type: 'process_photo' as const,
  payload: { photoId },
  status: 'running' as const,
  attempts: 1,
  maxAttempts: 5,
  lockedAt: now,
  lockedBy: 'worker-a',
};

function setup() {
  const calls: string[] = [];
  const recordFailure = vi.fn<PhotoProcessingRepository['recordFailure']>(
    async () => ({ status: 'retry', nextRunAt: now }),
  );
  const processing = {
    findById: vi.fn(async () => ({
      id: photoId,
      ownerId,
      originalPath: `originals/${ownerId}/22/22/${photoId}.jpg`,
      mimeType: 'image/jpeg',
      createdAt,
    })),
    complete: vi.fn(async () => { calls.push('complete'); }),
    recordFailure,
  };
  const storage = {
    createReadStream: vi.fn(() => {
      calls.push('read-original');
      return Readable.from([Buffer.from('original')]);
    }),
    writeDerivativeAtomically: vi.fn(async (path: string) => {
      calls.push(path.startsWith('previews/') ? 'write-preview' : 'write-thumbnail');
    }),
    removeIfPresent: vi.fn(async (path: string) => {
      calls.push(path.startsWith('previews/') ? 'remove-preview' : 'remove-thumbnail');
    }),
  };
  const imageProcessor = vi.fn<
    (input: ProcessImageInput) => Promise<ProcessedImage>
  >(async () => ({
    width: 1200,
    height: 800,
    capturedAt,
    preview: Buffer.from('preview'),
    thumbnail: Buffer.from('thumbnail'),
  }));
  return { calls, processing, storage, imageProcessor };
}

describe('processPhotoJob', () => {
  it('stores both derivatives before atomically marking the photo and job ready', async () => {
    const dependencies = setup();

    await expect(processPhotoJob(claimedJob, { ...dependencies, now: () => now }))
      .resolves.toEqual({ status: 'completed' });

    expect(dependencies.calls).toEqual([
      'read-original',
      'write-preview',
      'write-thumbnail',
      'complete',
    ]);
    expect(dependencies.processing.complete).toHaveBeenCalledWith(expect.objectContaining({
      jobId: claimedJob.id,
      photoId,
      width: 1200,
      height: 800,
      capturedAt,
      sortAt: capturedAt,
    }));
    expect(dependencies.storage.removeIfPresent).not.toHaveBeenCalled();
  });

  it('uses upload creation time when EXIF capture time is absent', async () => {
    const dependencies = setup();
    dependencies.imageProcessor.mockResolvedValueOnce({
      width: 1200,
      height: 800,
      capturedAt: null,
      preview: Buffer.from('preview'),
      thumbnail: Buffer.from('thumbnail'),
    });

    await processPhotoJob(claimedJob, { ...dependencies, now: () => now });

    expect(dependencies.processing.complete).toHaveBeenCalledWith(
      expect.objectContaining({ sortAt: createdAt }),
    );
  });

  it('cleans partial derivatives, preserves the original, and schedules a stable failure', async () => {
    const dependencies = setup();
    dependencies.storage.writeDerivativeAtomically
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk write failed'));
    dependencies.processing.recordFailure.mockResolvedValueOnce({
      status: 'failed',
      nextRunAt: null,
    });

    await expect(processPhotoJob(claimedJob, { ...dependencies, now: () => now }))
      .resolves.toEqual({ status: 'failed', failureCode: 'DERIVATIVE_WRITE_FAILED' });

    expect(dependencies.storage.removeIfPresent).toHaveBeenCalledTimes(2);
    expect(dependencies.processing.recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      jobId: claimedJob.id,
      photoId,
      failureCode: 'DERIVATIVE_WRITE_FAILED',
    }));
    expect(dependencies.calls).not.toContain('remove-original');
  });

  it('preserves a decoder failure code while scheduling retry', async () => {
    const dependencies = setup();
    dependencies.imageProcessor.mockRejectedValueOnce(
      new ImageProcessingError('INVALID_IMAGE', 'cannot decode'),
    );

    await expect(processPhotoJob(claimedJob, { ...dependencies, now: () => now }))
      .resolves.toEqual({ status: 'retry', failureCode: 'INVALID_IMAGE' });
    expect(dependencies.processing.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'INVALID_IMAGE' }),
    );
  });
});
