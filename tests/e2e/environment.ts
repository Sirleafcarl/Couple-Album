import { resolve } from 'node:path';

export const E2E_DATA_ROOT = resolve('test-results/e2e-data');
export const E2E_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? 'postgres://memory:memory@localhost:38427/memory_test';
export const E2E_API_PORT = process.env.E2E_API_PORT ?? '24001';
export const E2E_WEB_PORT = process.env.E2E_WEB_PORT ?? '25173';
export const E2E_API_ORIGIN = `http://127.0.0.1:${E2E_API_PORT}`;
export const E2E_WEB_ORIGIN = `http://127.0.0.1:${E2E_WEB_PORT}`;

export function requireE2eCredentials() {
  const firstEmail = process.env.E2E_USER_EMAIL;
  const firstPassword = process.env.E2E_USER_PASSWORD;
  const partnerEmail = process.env.E2E_PARTNER_EMAIL;
  const partnerPassword = process.env.E2E_PARTNER_PASSWORD;
  if (!firstEmail || !firstPassword || !partnerEmail || !partnerPassword) {
    throw new Error(
      'E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_PARTNER_EMAIL, and E2E_PARTNER_PASSWORD are required',
    );
  }
  return { firstEmail, firstPassword, partnerEmail, partnerPassword };
}
