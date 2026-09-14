import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './client.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const database = createDatabase(process.env.DATABASE_URL);
try {
  await migrate(database.db, { migrationsFolder: fileURLToPath(new URL('../migrations/', import.meta.url)) });
  console.log('Database migrations completed');
} finally {
  await database.close();
}
