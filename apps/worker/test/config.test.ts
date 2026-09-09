import { describe, expect, it } from 'vitest';
import { parseWorkerConfig } from '../src/config.js';
import { fileURLToPath } from 'node:url';

const required = {
  DATABASE_URL: 'postgres://memory:memory@localhost:38427/memory',
};

describe('parseWorkerConfig', () => {
  it('provides NAS-safe defaults', () => {
    expect(parseWorkerConfig(required)).toEqual({
      databaseUrl: required.DATABASE_URL,
      dataRoot: fileURLToPath(new URL('../../../data', import.meta.url)),
      concurrency: 1,
      pollMs: 1_000,
      staleJobMs: 900_000,
    });
  });

  it('resolves relative storage from the same workspace as the API', () => {
    expect(parseWorkerConfig({ ...required, DATA_ROOT: './shared-media' }).dataRoot).toBe(fileURLToPath(new URL('../../../shared-media', import.meta.url)));
  });

  it.each([
    ['IMAGE_WORKER_CONCURRENCY', '0'],
    ['IMAGE_WORKER_CONCURRENCY', '3'],
    ['IMAGE_WORKER_POLL_MS', '0'],
    ['STALE_JOB_MS', '0'],
  ])('rejects unsafe setting %s=%s', (name, value) => {
    expect(() => parseWorkerConfig({ ...required, [name]: value })).toThrow();
  });

  it('accepts concurrency two and explicit positive durations', () => {
    expect(parseWorkerConfig({
      ...required,
      DATA_ROOT: '/data',
      IMAGE_WORKER_CONCURRENCY: '2',
      IMAGE_WORKER_POLL_MS: '250',
      STALE_JOB_MS: '30000',
    })).toMatchObject({ dataRoot: '/data', concurrency: 2, pollMs: 250, staleJobMs: 30_000 });
  });
});
