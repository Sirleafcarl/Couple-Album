import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../src/client.js';
import { createAlbumPhotoRepository } from '../src/album-photo-repository.js';
import { albums, albumYearSettings, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const database = createDatabase(process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test');
const repo = createAlbumPhotoRepository(database.db);
async function reset() {
  await database.db.delete(albums);
  await database.db.delete(albumYearSettings);
  await database.db.delete(jobs);
  await database.db.delete(uploads);
  await database.db.delete(photos);
  await database.db.delete(sessions);
  await database.db.delete(users);
}
beforeEach(reset);
afterAll(async () => { await reset(); await database.close(); });
async function fixture() {
  const [me, partner] = await database.db.insert(users).values(['Me', 'Partner'].map(displayName => ({
    email: `${randomUUID()}@example.com`, displayName, passwordHash: 'test',
  }))).returning();
  const [album] = await database.db.insert(albums).values({ title: 'Together', occurredOn: '2026-09-08', createdBy: me!.id }).returning();
  const records = await database.db.insert(photos).values([me!, partner!].map((owner, index) => ({
    ownerId: owner.id, originalPath: `originals/${randomUUID()}`, originalFilename: `${index}.jpg`,
    contentHash: randomUUID(), mimeType: 'image/jpeg', sizeBytes: 12,
    capturedAt: new Date(`2026-01-0${2 - index}T12:00:00Z`),
  }))).returning();
  return { album: album!, me: me!, partner: partner!, records };
}
it('batch unlink removes only current album references and bumps version once', async () => {
  const { album, records, me } = await fixture();
  const [other] = await database.db.insert(albums).values({ title: 'Other', occurredOn: '2026-09-08', createdBy: me.id }).returning();
  const ids = records.map(p => p.id);
  await repo.add(album.id, ids); await repo.add(other!.id, ids);
  const before = (await repo.get(album.id, 0, 40))!;
  expect(await repo.removeMany(album.id, ids, before.version)).toEqual({ kind: 'updated' });
  expect(await repo.get(album.id, 0, 40)).toMatchObject({ total: 0, version: before.version + 1 });
  expect((await repo.get(other!.id, 0, 40))?.total).toBe(2);
  expect(await database.db.select().from(photos)).toHaveLength(2);
  expect((await database.db.select().from(photos)).every(p => !p.deletedAt)).toBe(true);
});
it('rejects the entire invalid or stale batch and serializes concurrent edits', async () => {
  const { album, records } = await fixture(); const ids = records.map(p => p.id);
  await repo.add(album.id, ids); const before = (await repo.get(album.id, 0, 40))!;
  expect(await repo.removeMany(album.id, [ids[0]!, randomUUID()], before.version)).toEqual({ kind: 'photo-not-found' });
  expect(await repo.removeMany(album.id, ids, before.version - 1)).toEqual({ kind: 'conflict' });
  expect(await repo.get(album.id, 0, 40)).toMatchObject({ total: 2, version: before.version });
  const results = await Promise.all(ids.map(id => repo.removeMany(album.id, [id], before.version)));
  expect(results.map(r => r.kind).sort()).toEqual(['conflict', 'updated']);
  expect((await repo.get(album.id, 0, 40))?.total).toBe(1);
});
it('links either owner exactly once and removal never deletes the original', async () => {
  const { album, records } = await fixture();
  expect(await repo.add(album.id, records.map(p => p.id))).toMatchObject({ kind: 'updated' });
  await repo.add(album.id, [records[0]!.id]);
  const detail = await repo.get(album.id, 0, 40);
  expect(detail?.total).toBe(2);
  expect(detail?.items.map(p => p.id)).toEqual([records[1]!.id, records[0]!.id]);
  expect(detail?.items[0]?.ownerId).toBe(records[1]!.ownerId);
  await repo.remove(album.id, records[1]!.id, detail!.version);
  expect((await repo.get(album.id, 0, 40))?.total).toBe(1);
  expect((await database.db.select().from(photos)).every(p => !p.deletedAt)).toBe(true);
});
it('rejects invalid batches atomically and never attaches deleted photos', async () => {
  const { album, records } = await fixture();
  expect(await repo.add(album.id, [records[0]!.id, randomUUID()])).toEqual({ kind: 'photo-not-found' });
  expect((await repo.get(album.id, 0, 40))?.total).toBe(0);
  await database.db.update(photos).set({ deletedAt: new Date() }).where(eq(photos.id, records[0]!.id));
  expect(await repo.add(album.id, [records[0]!.id])).toEqual({ kind: 'photo-not-found' });
});
it('persists a common order/layout and rejects stale edits', async () => {
  const { album, records } = await fixture();
  await repo.add(album.id, records.map(p => p.id));
  const first = await repo.get(album.id, 0, 1);
  expect(first?.total).toBe(2);
  expect(first?.items).toHaveLength(1);
  await repo.move(album.id, records[0]!.id, records[1]!.id, first!.version);
  const moved = await repo.get(album.id, 0, 40);
  expect(moved?.items.map(p => p.id)).toEqual(records.map(p => p.id));
  expect(await repo.setLayout(album.id, 'film', first!.version)).toEqual({ kind: 'conflict' });
  await repo.setLayout(album.id, 'garden', moved!.version);
  expect((await repo.get(album.id, 0, 40))?.layout).toBe('garden');
  expect((await repo.get(album.id, 0, 40))?.items.map(p => p.id)).toEqual(records.map(p => p.id));
  await database.db.update(albums).set({ deletedAt: new Date() }).where(eq(albums.id, album.id));
  expect(await repo.add(album.id, [records[0]!.id])).toEqual({ kind: 'not-found' });
  expect(await repo.get(album.id, 0, 40)).toBeNull();
});

it('paginates 200 references without repeats and serializes concurrent additions', async () => {
  const { album, me, records } = await fixture();
  const many = await database.db.insert(photos).values(Array.from({ length: 198 }, (_, index) => ({
    ownerId: me.id, originalPath: `originals/${randomUUID()}`, originalFilename: `more-${index}.jpg`,
    contentHash: randomUUID(), mimeType: 'image/jpeg', sizeBytes: 1,
  }))).returning({ id: photos.id });
  const ids = [...records, ...many].map(photo => photo.id);
  await Promise.all([repo.add(album.id, ids.slice(0, 100)), repo.add(album.id, ids.slice(100)), repo.add(album.id, ids.slice(0, 3))]);
  const readIds: string[] = [];
  for (let offset = 0; offset < 200; offset += 40) {
    const page = await repo.get(album.id, offset, 40);
    expect(page?.total).toBe(200);
    readIds.push(...page!.items.map(photo => photo.id));
  }
  expect(new Set(readIds).size).toBe(200);
  // Later EXIF extraction does not silently move an attached photo to a different page.
  await database.db.update(photos).set({ capturedAt: new Date('2000-01-01') }).where(eq(photos.id, many[0]!.id));
  expect((await repo.get(album.id, 0, 40))!.items.map(photo => photo.id)).toEqual(readIds.slice(0, 40));
});
