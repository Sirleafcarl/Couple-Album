import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { fileURLToPath } from 'node:url';

describe('parseConfig', () => {
  it('rejects an incomplete environment', () => {
    expect(() => parseConfig({})).toThrow('DATABASE_URL');
  });

  it('parses an explicit local configuration', () => {
    expect(parseConfig({
      DATABASE_URL: 'postgres://memory:memory@localhost:38427/memory',
      API_HOST: '127.0.0.1',
      API_PORT: '23001',
      APP_ORIGIN: 'http://localhost:5173',
      SESSION_COOKIE_SECURE: 'false',
    })).toMatchObject({ apiPort: 23001, sessionCookieSecure: false });
  });

  it('uses the project-specific API port when none is provided', () => {
    expect(parseConfig({
      DATABASE_URL: 'postgres://memory:memory@localhost:38427/memory',
      APP_ORIGIN: 'http://localhost:5173',
    })).toMatchObject({
      apiPort: 23001,
      dataRoot: fileURLToPath(new URL('../../../data', import.meta.url)),
      maxUploadBytes: 104_857_600,
      minFreeBytes: 1_073_741_824,
      imageWorkerConcurrency: 1,
      imageWorkerPollMs: 1_000,
      staleJobMs: 900_000,
      stagingTtlMs: 86_400_000,
    });
  });

  it('resolves relative storage from the workspace and preserves absolute paths', () => {
    const env = { DATABASE_URL: 'postgres://localhost/memory', APP_ORIGIN: 'http://localhost:5173' };
    expect(parseConfig({ ...env, DATA_ROOT: './shared-media' }).dataRoot).toBe(fileURLToPath(new URL('../../../shared-media', import.meta.url)));
    expect(parseConfig({ ...env, DATA_ROOT: '/srv/memory' }).dataRoot).toBe('/srv/memory');
  });

  it.each([
    ['MAX_UPLOAD_BYTES', '0'],
    ['MIN_FREE_BYTES', '0'],
    ['IMAGE_WORKER_CONCURRENCY', '0'],
    ['IMAGE_WORKER_CONCURRENCY', '3'],
    ['IMAGE_WORKER_POLL_MS', '0'],
    ['STALE_JOB_MS', '0'],
    ['STAGING_TTL_MS', '0'],
  ])('rejects unsafe media setting %s=%s', (name, value) => {
    expect(() => parseConfig({
      DATABASE_URL: 'postgres://memory:memory@localhost:38427/memory',
      APP_ORIGIN: 'http://localhost:5173',
      [name]: value,
    })).toThrow();
  });
});
