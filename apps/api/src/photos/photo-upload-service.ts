import { basename } from 'node:path';
import type { Readable } from 'node:stream';
import type {
  IngestionRepository,
  PhotoRepository,
  UploadRepository,
} from '@memory/db';
import type { MediaStorage } from '@memory/media';
import { PhotoUploadError, toPhotoUploadError } from './photo-errors.js';

export function sanitizeOriginalFilename(filename: string): string {
  const safeBasename = basename(filename.replaceAll('\\', '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return safeBasename.slice(0, 255) || 'unnamed-image';
}

export type PhotoUploadService = {
  upload(input: {
    ownerId: string;
    originalFilename: string;
    source: Readable;
    allowDuplicate: boolean;
  }): Promise<{ uploadId: string; photoId: string; status: 'processing' }>;
};

export function createPhotoUploadService(dependencies: {
  storage: MediaStorage;
  photos: Pick<PhotoRepository, 'findDuplicate'>;
  uploads: UploadRepository;
  ingestion: IngestionRepository;
  clock: () => Date;
  createId: () => string;
  reportCleanupError: (error: unknown) => void;
}): PhotoUploadService {
  async function cleanup(operation: () => Promise<void>): Promise<boolean> {
    try {
      await operation();
      return true;
    } catch (error) {
      dependencies.reportCleanupError(error);
      return false;
    }
  }

  return {
    async upload(input) {
      const now = dependencies.clock();
      const originalFilename = sanitizeOriginalFilename(input.originalFilename);
      const upload = await dependencies.uploads.createReceiving({
        ownerId: input.ownerId,
        originalFilename,
        now,
      });
      let stagingPath: string | null = null;
      let originalPath: string | null = null;

      try {
        const staged = await dependencies.storage.writeStaging(upload.id, input.source);
        stagingPath = staged.stagingPath;
        await dependencies.uploads.recordStaged({
          id: upload.id,
          ownerId: input.ownerId,
          stagingPath: staged.stagingPath,
          bytesReceived: staged.sizeBytes,
          contentHash: staged.sha256,
          now,
        });
        const detected = await dependencies.storage.inspectStaged(staged.stagingPath);
        const duplicate = await dependencies.photos.findDuplicate(input.ownerId, staged.sha256);
        if (duplicate && !input.allowDuplicate) {
          await cleanup(() => dependencies.storage.removeIfPresent(staged.stagingPath));
          stagingPath = null;
          await dependencies.uploads.markDuplicate({
            id: upload.id,
            ownerId: input.ownerId,
            bytesReceived: staged.sizeBytes,
            contentHash: staged.sha256,
            now,
          });
          throw new PhotoUploadError('DUPLICATE_PHOTO', 409, 'Photo already exists', {
            existingPhotoId: duplicate.id,
          });
        }

        const photoId = dependencies.createId();
        originalPath = await dependencies.storage.commitOriginal({
          stagingPath: staged.stagingPath,
          ownerId: input.ownerId,
          photoId,
          extension: detected.extension,
        });
        try {
          await dependencies.ingestion.commitUpload({
            uploadId: upload.id,
            photoId,
            ownerId: input.ownerId,
            originalPath,
            originalFilename,
            contentHash: staged.sha256,
            mimeType: detected.mimeType,
            sizeBytes: staged.sizeBytes,
            now,
          });
        } catch (error) {
          const movedBack = await cleanup(() =>
            dependencies.storage.moveOriginalBack(originalPath!, staged.stagingPath));
          if (movedBack) originalPath = null;
          throw error;
        }
        stagingPath = null;
        return { uploadId: upload.id, photoId, status: 'processing' };
      } catch (error) {
        const uploadError = toPhotoUploadError(error);
        if (uploadError.code === 'DUPLICATE_PHOTO') throw uploadError;

        if (stagingPath) {
          await cleanup(() => dependencies.storage.removeIfPresent(stagingPath!));
        }
        await cleanup(() => dependencies.uploads.markFailed({
          id: upload.id,
          ownerId: input.ownerId,
          errorCode: uploadError.code,
          now,
        }));
        throw uploadError;
      }
    },
  };
}
