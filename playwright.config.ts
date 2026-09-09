import { defineConfig, devices } from '@playwright/test';
import {
  E2E_API_ORIGIN,
  E2E_API_PORT,
  E2E_DATABASE_URL,
  E2E_DATA_ROOT,
  E2E_WEB_ORIGIN,
  E2E_WEB_PORT,
} from './tests/e2e/environment.js';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // These journeys share the two fixed users and one reset test database.
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: E2E_WEB_ORIGIN,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @memory/db db:migrate && pnpm -r --parallel --filter @memory/api --filter @memory/worker dev:e2e',
      url: `${E2E_API_ORIGIN}/api/health`,
      env: {
        ...process.env,
        DATABASE_URL: E2E_DATABASE_URL,
        DATA_ROOT: E2E_DATA_ROOT,
        APP_ORIGIN: E2E_WEB_ORIGIN,
        API_HOST: '127.0.0.1',
        API_PORT: E2E_API_PORT,
        SESSION_COOKIE_SECURE: 'false',
        MIN_FREE_BYTES: '1',
        IMAGE_WORKER_POLL_MS: '1000',
        STALE_JOB_MS: '1000',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: `pnpm --filter @memory/web exec vite --host 127.0.0.1 --port ${E2E_WEB_PORT}`,
      url: E2E_WEB_ORIGIN,
      env: {
        ...process.env,
        API_PROXY_TARGET: E2E_API_ORIGIN,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
