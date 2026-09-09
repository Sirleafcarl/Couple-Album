import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { E2E_DATA_ROOT } from './environment.js';

export default async function globalTeardown() {
  if (E2E_DATA_ROOT !== resolve('test-results/e2e-data')) {
    throw new Error('Refusing to clean an unexpected E2E data root');
  }
  await rm(E2E_DATA_ROOT, { recursive: true, force: true });
}
