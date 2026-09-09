import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(url: string): { db: Database; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
