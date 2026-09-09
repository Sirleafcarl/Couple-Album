import { desc, eq, sql } from 'drizzle-orm';
import type { AlbumThemeId } from '@memory/contracts/albums';
import type { Database } from './client.js';
import { albumYearSettings } from './schema.js';

export type AlbumYearSetting = { year: number; themeId: AlbumThemeId; version: number };
export type AlbumYearSettingsResult =
  | { kind: 'updated'; setting: AlbumYearSetting }
  | { kind: 'conflict'; setting: AlbumYearSetting };
export type AlbumYearSettingsRepository = {
  list(): Promise<AlbumYearSetting[]>;
  set(input: {
    year: number;
    themeId: AlbumThemeId;
    version: number | null;
    updatedBy: string;
  }): Promise<AlbumYearSettingsResult>;
};

const selection = {
  year: albumYearSettings.year,
  themeId: albumYearSettings.themeId,
  version: albumYearSettings.version,
};

export function createAlbumYearSettingsRepository(db: Database): AlbumYearSettingsRepository {
  async function getRequired(year: number): Promise<AlbumYearSetting> {
    const [setting] = await db.select(selection).from(albumYearSettings)
      .where(eq(albumYearSettings.year, year)).limit(1);
    if (!setting) throw new Error('Album year setting conflict row is missing');
    return setting;
  }

  return {
    async list() {
      return db.select(selection).from(albumYearSettings).orderBy(desc(albumYearSettings.year));
    },

    async set(input) {
      if (input.version === null) {
        const [created] = await db.insert(albumYearSettings).values({
          year: input.year,
          themeId: input.themeId,
          updatedBy: input.updatedBy,
        }).onConflictDoNothing().returning(selection);
        return created
          ? { kind: 'updated', setting: created }
          : { kind: 'conflict', setting: await getRequired(input.year) };
      }

      const [updated] = await db.update(albumYearSettings).set({
        themeId: input.themeId,
        updatedBy: input.updatedBy,
        version: sql`${albumYearSettings.version} + 1`,
        updatedAt: new Date(),
      }).where(sql`${albumYearSettings.year} = ${input.year}
        and ${albumYearSettings.version} = ${input.version}`)
        .returning(selection);
      return updated
        ? { kind: 'updated', setting: updated }
        : { kind: 'conflict', setting: await getRequired(input.year) };
    },
  };
}
