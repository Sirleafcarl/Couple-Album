import { z } from 'zod';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(23001),
  APP_ORIGIN: z.string().url(),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  DATA_ROOT: z.string().min(1).default('./data'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104_857_600),
  MIN_FREE_BYTES: z.coerce.number().int().positive().default(1_073_741_824),
  IMAGE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1),
  IMAGE_WORKER_POLL_MS: z.coerce.number().int().positive().default(1_000),
  STALE_JOB_MS: z.coerce.number().int().positive().default(900_000),
  STAGING_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
});

export type AppConfig = {
  databaseUrl: string;
  apiHost: string;
  apiPort: number;
  appOrigin: string;
  sessionCookieSecure: boolean;
  dataRoot: string;
  maxUploadBytes: number;
  minFreeBytes: number;
  imageWorkerConcurrency: number;
  imageWorkerPollMs: number;
  staleJobMs: number;
  stagingTtlMs: number;
};

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const value = EnvSchema.parse(env);
  return {
    databaseUrl: value.DATABASE_URL,
    apiHost: value.API_HOST,
    apiPort: value.API_PORT,
    appOrigin: value.APP_ORIGIN,
    sessionCookieSecure: value.SESSION_COOKIE_SECURE === 'true',
    // src/ and dist/ occupy the same level in the workspace and container.
    dataRoot: resolve(fileURLToPath(new URL('../../../', import.meta.url)), value.DATA_ROOT),
    maxUploadBytes: value.MAX_UPLOAD_BYTES,
    minFreeBytes: value.MIN_FREE_BYTES,
    imageWorkerConcurrency: value.IMAGE_WORKER_CONCURRENCY,
    imageWorkerPollMs: value.IMAGE_WORKER_POLL_MS,
    staleJobMs: value.STALE_JOB_MS,
    stagingTtlMs: value.STAGING_TTL_MS,
  };
}
