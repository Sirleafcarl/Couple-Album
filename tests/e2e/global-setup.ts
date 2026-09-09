import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createDatabase,
  createUserRepository,
  albums,
  albumYearSettings,
  jobs,
  photos,
  sessions,
  uploads,
  users,
} from '../../packages/db/src/index.js';
import { hashPassword } from '../../apps/api/src/auth/password.js';
import { E2E_DATABASE_URL, E2E_DATA_ROOT, requireE2eCredentials } from './environment.js';

function assertTestTargets() {
  const databaseName = new URL(E2E_DATABASE_URL).pathname.slice(1);
  if (!databaseName.endsWith('_test')) throw new Error('E2E database name must end in _test');
  if (E2E_DATA_ROOT !== resolve('test-results/e2e-data')) {
    throw new Error('Refusing to clean an unexpected E2E data root');
  }
}

export default async function globalSetup() {
  assertTestTargets();
  const credentials = requireE2eCredentials();
  await rm(E2E_DATA_ROOT, { recursive: true, force: true });
  await mkdir(E2E_DATA_ROOT, { recursive: true });

  const database = createDatabase(E2E_DATABASE_URL);
  try {
    await database.db.transaction(async (transaction) => {
      await transaction.delete(jobs);
      await transaction.delete(uploads);
      await transaction.delete(photos);
      await transaction.delete(albumYearSettings);
      await transaction.delete(albums);
      await transaction.delete(sessions);
      await transaction.delete(users);
    });
    const repository = createUserRepository(database.db);
    await repository.create({
      email: credentials.firstEmail,
      displayName: 'First',
      passwordHash: await hashPassword(credentials.firstPassword),
    });
    await repository.create({
      email: credentials.partnerEmail,
      displayName: 'Partner',
      passwordHash: await hashPassword(credentials.partnerPassword),
    });
  } finally {
    await database.close();
  }
}
