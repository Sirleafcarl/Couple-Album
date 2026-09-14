import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import type { PhotoTransaction } from './photo-trash-repository.js';
import { jobs, photos } from './schema.js';

export type ProcessingPhoto = {
  id: string;
  ownerId: string;
  originalPath: string;
  mimeType: string;
  createdAt: Date;
};

export type PhotoProcessingRepository = {
  findById(photoId: string): Promise<ProcessingPhoto | null>;
  complete(input: {
    jobId: string;
    photoId: string;
    previewPath: string;
    thumbnailPath: string;
    width: number;
    height: number;
    capturedAt: Date | null;
    sortAt: Date;
    now: Date;
  }): Promise<void>;
  recordFailure(input: {
    jobId: string;
    photoId: string;
    failureCode: string;
    error: string;
    now: Date;
  }): Promise<{ status: 'retry' | 'failed'; nextRunAt: Date | null }>;
};

export function createPhotoProcessingRepository(db: Database | PhotoTransaction): PhotoProcessingRepository {
  return {
    async findById(photoId) {
      const [photo] = await db.select({
        id: photos.id,
        ownerId: photos.ownerId,
        originalPath: photos.originalPath,
        mimeType: photos.mimeType,
        createdAt: photos.createdAt,
      }).from(photos).where(and(
        eq(photos.id, photoId),
        eq(photos.status, 'processing'),
      )).limit(1);
      return photo ?? null;
    },

    async complete(input) {
      await db.transaction(async (transaction) => {
        const [photo] = await transaction.update(photos).set({
          previewPath: input.previewPath,
          thumbnailPath: input.thumbnailPath,
          width: input.width,
          height: input.height,
          capturedAt: input.capturedAt,
          sortAt: input.sortAt,
          status: 'ready',
          failureCode: null,
          updatedAt: input.now,
        }).where(and(
          eq(photos.id, input.photoId),
          eq(photos.status, 'processing'),
        )).returning({ id: photos.id });
        if (!photo) throw new Error('Processing photo was not found');

        const [job] = await transaction.update(jobs).set({
          status: 'completed',
          lockedAt: null,
          lockedBy: null,
          updatedAt: input.now,
        }).where(and(
          eq(jobs.id, input.jobId),
          eq(jobs.status, 'running'),
        )).returning({ id: jobs.id });
        if (!job) throw new Error('Running job was not found');
      });
    },

    async recordFailure(input) {
      return db.transaction(async (transaction) => {
        const locked = await transaction.execute(sql`
          select ${jobs.attempts} as "attempts", ${jobs.maxAttempts} as "maxAttempts"
          from ${jobs}
          where ${jobs.id} = ${input.jobId} and ${jobs.status} = 'running'
          for update
        `);
        const row = locked.rows[0] as { attempts: number; maxAttempts: number } | undefined;
        if (!row) throw new Error('Running job was not found');

        if (row.attempts >= row.maxAttempts) {
          await transaction.update(jobs).set({
            status: 'failed',
            lockedAt: null,
            lockedBy: null,
            lastError: input.error,
            updatedAt: input.now,
          }).where(eq(jobs.id, input.jobId));
          const [photo] = await transaction.update(photos).set({
            status: 'failed',
            failureCode: input.failureCode,
            updatedAt: input.now,
          }).where(and(
            eq(photos.id, input.photoId),
            eq(photos.status, 'processing'),
          )).returning({ id: photos.id });
          if (!photo) throw new Error('Processing photo was not found');
          return { status: 'failed' as const, nextRunAt: null };
        }

        const delaySeconds = Math.min(30 * (2 ** (row.attempts - 1)), 3_600);
        const nextRunAt = new Date(input.now.getTime() + delaySeconds * 1_000);
        await transaction.update(jobs).set({
          status: 'retry',
          nextRunAt,
          lockedAt: null,
          lockedBy: null,
          lastError: input.error,
          updatedAt: input.now,
        }).where(eq(jobs.id, input.jobId));
        return { status: 'retry' as const, nextRunAt };
      });
    },
  };
}
