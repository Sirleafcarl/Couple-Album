import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createDatabase } from '../src/client.js';
import { createPhotoRepository } from '../src/photo-repository.js';

const enabled = process.env.RUN_PERFORMANCE_TESTS === 'true';
const databaseUrl = process.env.TEST_DATABASE_URL
  ?? 'postgres://memory:memory@localhost:38427/memory_test';
const ownerId = 'f0000000-0000-4000-8000-000000000001';
const otherOwnerId = 'f0000000-0000-4000-8000-000000000002';
const pool = new Pool({ connectionString: databaseUrl });
const database = createDatabase(databaseUrl);
const repository = createPhotoRepository(database.db);

function indexNames(plan: unknown): string[] {
  if (Array.isArray(plan)) return plan.flatMap(indexNames);
  if (!plan || typeof plan !== 'object') return [];
  const record = plan as Record<string, unknown>;
  return [
    ...(typeof record['Index Name'] === 'string' ? [record['Index Name']] : []),
    ...Object.values(record).flatMap(indexNames),
  ];
}

function photoNodeTypes(plan: unknown): string[] {
  if (Array.isArray(plan)) return plan.flatMap(photoNodeTypes);
  if (!plan || typeof plan !== 'object') return [];
  const record = plan as Record<string, unknown>;
  const current = record['Relation Name'] === 'photos' && typeof record['Node Type'] === 'string'
    ? [record['Node Type']]
    : [];
  return [...current, ...Object.values(record).flatMap(photoNodeTypes)];
}

describe.runIf(enabled)('photo library performance', () => {
  beforeAll(async () => {
    await pool.query('begin');
    try {
      await pool.query(
        `insert into users (id, email, display_name, password_hash)
         values
           ($1, 'performance@example.com', 'Performance', 'not-used'),
           ($2, 'performance-partner@example.com', 'Performance Partner', 'not-used')
         on conflict (id) do nothing`,
        [ownerId, otherOwnerId],
      );
      await pool.query('delete from photos where owner_id = any($1::uuid[])', [[ownerId, otherOwnerId]]);
      await pool.query(
        `insert into photos (
           owner_id, original_path, original_filename, content_hash, mime_type,
           size_bytes, width, height, status, sort_at, created_at, updated_at
         )
         select case when value % 2 = 0 then $1::uuid else $2::uuid end,
           'originals/performance/' || value, value || '.jpg',
           md5(value::text), 'image/jpeg', 1024, 1200, 800, 'ready',
           timestamptz '2026-09-02 00:00:00+00' - value * interval '1 second',
           now(), now()
         from generate_series(1, 10000) as value`,
        [ownerId, otherOwnerId],
      );
      await pool.query('commit');
      await pool.query('analyze photos');
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }, 30_000);

  afterAll(async () => {
    if (enabled) {
      await pool.query('delete from photos where owner_id = any($1::uuid[])', [[ownerId, otherOwnerId]]);
      await pool.query('delete from users where id = any($1::uuid[])', [[ownerId, otherOwnerId]]);
    }
    await Promise.all([pool.end(), database.close()]);
  });

  it('uses active-photo indexes for first and deep cursor pages within 500 ms', async () => {
    const cursorResult = await pool.query<{ sort_at: Date; id: string }>(
      `select sort_at, id from photos where owner_id = $1 and deleted_at is null
       order by sort_at desc, id desc offset 4499 limit 1`,
      [ownerId],
    );
    const cursor = cursorResult.rows[0]!;

    const firstStarted = performance.now();
    const first = await repository.list({ limit: 40 });
    const firstElapsed = performance.now() - firstStarted;
    const deepStarted = performance.now();
    const deep = await repository.list({
      ownerId,
      limit: 40,
      cursor: { sortAt: cursor.sort_at, id: cursor.id },
    });
    const deepElapsed = performance.now() - deepStarted;

    expect(first.items).toHaveLength(40);
    expect(deep.items).toHaveLength(40);
    expect(firstElapsed).toBeLessThan(500);
    expect(deepElapsed).toBeLessThan(500);

    const allPlan = await pool.query(
      `explain (analyze, format json)
       select photos.id from photos inner join users on photos.owner_id = users.id
       where photos.deleted_at is null
       order by photos.sort_at desc, photos.id desc limit 41`,
    );
    const ownerPlan = await pool.query(
      `explain (analyze, format json)
       select photos.id from photos inner join users on photos.owner_id = users.id
       where photos.deleted_at is null and photos.owner_id = $1
         and (photos.sort_at, photos.id) < ($2, $3::uuid)
       order by photos.sort_at desc, photos.id desc limit 41`,
      [ownerId, cursor.sort_at, cursor.id],
    );

    expect(
      indexNames(allPlan.rows[0]?.['QUERY PLAN']),
      JSON.stringify(allPlan.rows[0]?.['QUERY PLAN']),
    ).toContain('photos_active_sort_index');
    const ownerPlanJson = ownerPlan.rows[0]?.['QUERY PLAN'];
    const ownerIndexNames = indexNames(ownerPlanJson);
    expect(
      ownerIndexNames.some((name) => [
        'photos_active_sort_index',
        'photos_owner_active_sort_index',
      ].includes(name)),
      JSON.stringify(ownerPlanJson),
    ).toBe(true);
    expect(photoNodeTypes(ownerPlanJson)).not.toContain('Seq Scan');
  }, 30_000);
});
