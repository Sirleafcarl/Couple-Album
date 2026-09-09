import { z } from 'zod';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WorkerEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATA_ROOT: z.string().min(1).default('./data'),
  IMAGE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1),
  IMAGE_WORKER_POLL_MS: z.coerce.number().int().positive().default(1_000),
  STALE_JOB_MS: z.coerce.number().int().positive().default(900_000),
});

export type WorkerConfig = {
  databaseUrl: string;
  dataRoot: string;
  concurrency: number;
  pollMs: number;
  staleJobMs: number;
};

export function parseWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const value = WorkerEnvSchema.parse(env);
  return {
    databaseUrl: value.DATABASE_URL,
    // Resolve relative settings identically to the API, never from process.cwd().
    dataRoot: resolve(fileURLToPath(new URL('../../../', import.meta.url)), value.DATA_ROOT),
    concurrency: value.IMAGE_WORKER_CONCURRENCY,
    pollMs: value.IMAGE_WORKER_POLL_MS,
    staleJobMs: value.STALE_JOB_MS,
  };
}
