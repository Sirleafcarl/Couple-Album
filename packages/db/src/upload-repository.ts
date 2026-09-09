import { and, desc, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { uploads } from './schema.js';

type UploadIdentity = { id: string; ownerId: string; now: Date };

export type UploadHistoryItem = {
  id: string;
  originalFilename: string;
  status: 'receiving' | 'committed' | 'duplicate' | 'failed';
  bytesReceived: number;
  errorCode: string | null;
  photoId: string | null;
  createdAt: Date;
};

export type UploadRepository = {
  createReceiving(input: {
    ownerId: string;
    originalFilename: string;
    now: Date;
  }): Promise<UploadHistoryItem>;
  recordStaged(input: UploadIdentity & {
    stagingPath: string;
    bytesReceived: number;
    contentHash: string;
  }): Promise<void>;
  markFailed(input: UploadIdentity & { errorCode: string }): Promise<void>;
  markDuplicate(input: UploadIdentity & {
    bytesReceived: number;
    contentHash: string;
  }): Promise<void>;
  listForOwner(ownerId: string, limit: number): Promise<UploadHistoryItem[]>;
};

const historyColumns = {
  id: uploads.id,
  originalFilename: uploads.originalFilename,
  status: uploads.status,
  bytesReceived: uploads.bytesReceived,
  errorCode: uploads.errorCode,
  photoId: uploads.photoId,
  createdAt: uploads.createdAt,
};

export function createUploadRepository(db: Database): UploadRepository {
  async function updateOwned(
    input: UploadIdentity,
    values: Partial<typeof uploads.$inferInsert>,
  ): Promise<void> {
    const [updated] = await db.update(uploads)
      .set({ ...values, updatedAt: input.now })
      .where(and(eq(uploads.id, input.id), eq(uploads.ownerId, input.ownerId)))
      .returning({ id: uploads.id });
    if (!updated) throw new Error('Upload was not found');
  }

  return {
    async createReceiving(input) {
      const [created] = await db.insert(uploads).values({
        ownerId: input.ownerId,
        originalFilename: input.originalFilename,
        createdAt: input.now,
        updatedAt: input.now,
      }).returning(historyColumns);
      if (!created) throw new Error('Upload was not created');
      return created;
    },

    async recordStaged(input) {
      await updateOwned(input, {
        stagingPath: input.stagingPath,
        bytesReceived: input.bytesReceived,
        contentHash: input.contentHash,
      });
    },

    async markFailed(input) {
      await updateOwned(input, {
        status: 'failed',
        stagingPath: null,
        errorCode: input.errorCode,
      });
    },

    async markDuplicate(input) {
      await updateOwned(input, {
        status: 'duplicate',
        stagingPath: null,
        bytesReceived: input.bytesReceived,
        contentHash: input.contentHash,
        errorCode: 'DUPLICATE_PHOTO',
      });
    },

    async listForOwner(ownerId, limit) {
      return db.select(historyColumns)
        .from(uploads)
        .where(eq(uploads.ownerId, ownerId))
        .orderBy(desc(uploads.createdAt), desc(uploads.id))
        .limit(limit);
    },
  };
}
