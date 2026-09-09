import { and, eq, lt, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { jobs, type ProcessPhotoJobPayload } from './schema.js';

export type ClaimedJob = {
  id: string;
  type: 'process_photo';
  payload: ProcessPhotoJobPayload;
  status: 'running';
  attempts: number;
  maxAttempts: number;
  lockedAt: Date;
  lockedBy: string;
};

export type JobRepository = {
  claimNext(workerId: string, now: Date): Promise<ClaimedJob | null>;
  recordFailure(
    id: string,
    error: string,
    now: Date,
  ): Promise<{ status: 'retry' | 'failed'; nextRunAt: Date | null }>;
  recoverStale(now: Date, staleJobMs: number): Promise<number>;
  complete(id: string, now: Date): Promise<void>;
};

type ClaimedJobRow = {
  id: string;
  type: 'process_photo';
  payload: ProcessPhotoJobPayload;
  status: 'running';
  attempts: number;
  maxAttempts: number;
  lockedAt: Date;
  lockedBy: string;
};

export function createJobRepository(db: Database): JobRepository {
  return {
    async claimNext(workerId, now) {
      return db.transaction(async (transaction) => {
        const result = await transaction.execute(sql`
          with candidate as (
            select id
            from ${jobs}
            where ${jobs.status} in ('queued', 'retry')
              and ${jobs.nextRunAt} <= ${now}
            order by ${jobs.nextRunAt} asc, ${jobs.id} asc
            for update skip locked
            limit 1
          )
          update ${jobs}
          set status = 'running',
              attempts = ${jobs.attempts} + 1,
              locked_at = ${now},
              locked_by = ${workerId},
              updated_at = ${now}
          from candidate
          where ${jobs.id} = candidate.id
          returning ${jobs.id} as "id",
                    ${jobs.type} as "type",
                    ${jobs.payload} as "payload",
                    ${jobs.status} as "status",
                    ${jobs.attempts} as "attempts",
                    ${jobs.maxAttempts} as "maxAttempts",
                    ${jobs.lockedAt} as "lockedAt",
                    ${jobs.lockedBy} as "lockedBy"
        `);
        return (result.rows[0] as ClaimedJobRow | undefined) ?? null;
      });
    },

    async recordFailure(id, error, now) {
      return db.transaction(async (transaction) => {
        const locked = await transaction.execute(sql`
          select ${jobs.attempts} as "attempts", ${jobs.maxAttempts} as "maxAttempts"
          from ${jobs}
          where ${jobs.id} = ${id} and ${jobs.status} = 'running'
          for update
        `);
        const row = locked.rows[0] as { attempts: number; maxAttempts: number } | undefined;
        if (!row) throw new Error('Running job was not found');

        if (row.attempts >= row.maxAttempts) {
          await transaction.update(jobs).set({
            status: 'failed',
            lockedAt: null,
            lockedBy: null,
            lastError: error,
            updatedAt: now,
          }).where(eq(jobs.id, id));
          return { status: 'failed' as const, nextRunAt: null };
        }

        const delaySeconds = Math.min(30 * (2 ** (row.attempts - 1)), 3_600);
        const nextRunAt = new Date(now.getTime() + delaySeconds * 1_000);
        await transaction.update(jobs).set({
          status: 'retry',
          nextRunAt,
          lockedAt: null,
          lockedBy: null,
          lastError: error,
          updatedAt: now,
        }).where(eq(jobs.id, id));
        return { status: 'retry' as const, nextRunAt };
      });
    },

    async recoverStale(now, staleJobMs) {
      const cutoff = new Date(now.getTime() - staleJobMs);
      const recovered = await db.update(jobs).set({
        status: 'retry',
        nextRunAt: now,
        lockedAt: null,
        lockedBy: null,
        updatedAt: now,
      }).where(and(eq(jobs.status, 'running'), lt(jobs.lockedAt, cutoff)))
        .returning({ id: jobs.id });
      return recovered.length;
    },

    async complete(id, now) {
      const [completed] = await db.update(jobs).set({
        status: 'completed',
        lockedAt: null,
        lockedBy: null,
        updatedAt: now,
      }).where(and(eq(jobs.id, id), eq(jobs.status, 'running')))
        .returning({ id: jobs.id });
      if (!completed) throw new Error('Running job was not found');
    },
  };
}
