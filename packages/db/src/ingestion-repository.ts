import { and, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { jobs, photos, uploads } from './schema.js';

export type CommitUploadInput = {
  uploadId: string;
  photoId: string;
  ownerId: string;
  originalPath: string;
  originalFilename: string;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  now: Date;
};

export type IngestionRepository = {
  commitUpload(input: CommitUploadInput): Promise<{ photoId: string; jobId: string }>;
};

export function createIngestionRepository(db: Database): IngestionRepository {
  return {
    async commitUpload(input) {
      return db.transaction(async (transaction) => {
        await transaction.insert(photos).values({
          id: input.photoId,
          ownerId: input.ownerId,
          originalPath: input.originalPath,
          originalFilename: input.originalFilename,
          contentHash: input.contentHash,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sortAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        });

        const [job] = await transaction.insert(jobs).values({
          type: 'process_photo',
          payload: { photoId: input.photoId },
          nextRunAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        }).returning({ id: jobs.id });
        if (!job) throw new Error('Processing job was not created');

        const [upload] = await transaction.update(uploads).set({
          status: 'committed',
          stagingPath: null,
          contentHash: input.contentHash,
          photoId: input.photoId,
          updatedAt: input.now,
        }).where(and(eq(uploads.id, input.uploadId), eq(uploads.ownerId, input.ownerId)))
          .returning({ id: uploads.id });
        if (!upload) throw new Error('Upload was not found');

        return { photoId: input.photoId, jobId: job.id };
      });
    },
  };
}
