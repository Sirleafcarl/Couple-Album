import {
  CreateAlbumInputSchema,
  UpdateAlbumInputSchema,
  UpdateAlbumThemeInputSchema,
} from '@memory/contracts/albums';
import type { AlbumRepository, AlbumYearSettingsRepository, SessionRepository } from '@memory/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRequireUser } from '../auth/require-user.js';
import { presentAlbum } from './album-presenter.js';

const AlbumParamsSchema = z.strictObject({ albumId: z.string().uuid() });
const AlbumYearParamsSchema = z.strictObject({ year: z.coerce.number().int().min(1000).max(9999) });

type Dependencies = {
  sessions: SessionRepository;
  albums: AlbumRepository;
  albumYearSettings: AlbumYearSettingsRepository;
  clock: () => Date;
};

export function registerAlbumRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  const requireUser = createRequireUser(dependencies.sessions, dependencies.clock);

  app.get('/api/albums', { preHandler: requireUser }, async () => {
    const [records, settings] = await Promise.all([
      dependencies.albums.listActive(),
      dependencies.albumYearSettings.list(),
    ]);
    const settingsByYear = new Map(settings.map((setting) => [setting.year, setting]));
    const byYear = new Map<number, ReturnType<typeof presentAlbum>[]>();
    for (const record of records) {
      const album = presentAlbum(record);
      const group = byYear.get(album.year) ?? [];
      group.push(album);
      byYear.set(album.year, group);
    }
    return {
      years: [...byYear.entries()].sort(([left], [right]) => right - left).map(([year, albums]) => {
        const setting = settingsByYear.get(year);
        return {
          year,
          themeId: setting?.themeId ?? 'secret-garden' as const,
          themeVersion: setting?.version ?? null,
          albums,
        };
      }),
    };
  });

  app.post('/api/albums', { preHandler: requireUser }, async (request, reply) => {
    const parsed = CreateAlbumInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_ALBUM_INPUT' });
    const album = await dependencies.albums.create({ ...parsed.data, createdBy: request.user!.id });
    return reply.code(201).send(presentAlbum(album));
  });

  app.patch('/api/albums/:albumId', { preHandler: requireUser }, async (request, reply) => {
    const params = AlbumParamsSchema.safeParse(request.params);
    const body = UpdateAlbumInputSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: 'INVALID_ALBUM_INPUT' });
    }
    const update = { id: params.data.albumId, version: body.data.version } as {
      id: string;
      version: number;
      title?: string;
      description?: string;
      occurredOn?: string;
    };
    if (body.data.title !== undefined) update.title = body.data.title;
    if (body.data.description !== undefined) update.description = body.data.description;
    if (body.data.occurredOn !== undefined) update.occurredOn = body.data.occurredOn;
    const result = await dependencies.albums.update(update);
    if (result.kind === 'not-found') return reply.code(404).send({ error: 'ALBUM_NOT_FOUND' });
    if (result.kind === 'conflict') {
      return reply.code(409).send({
        error: 'ALBUM_VERSION_CONFLICT', current: presentAlbum(result.album),
      });
    }
    return presentAlbum(result.album);
  });

  app.put('/api/album-years/:year/theme', { preHandler: requireUser }, async (request, reply) => {
    const params = AlbumYearParamsSchema.safeParse(request.params);
    const body = UpdateAlbumThemeInputSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: 'INVALID_ALBUM_THEME' });
    }
    const result = await dependencies.albumYearSettings.set({
      year: params.data.year, ...body.data, updatedBy: request.user!.id,
    });
    if (result.kind === 'conflict') {
      return reply.code(409).send({
        error: 'ALBUM_THEME_VERSION_CONFLICT', current: result.setting,
      });
    }
    return result.setting;
  });
}
