import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AlbumRepository, AlbumYearSettingsRepository, PhotoRepository, SessionRepository, UploadRepository, UserRepository } from '@memory/db';
import type { MediaStorage } from '@memory/media';
import { createAuthService } from './auth/auth-service.js';
import { registerAuthRoutes } from './auth/auth-routes.js';
import { createLoginAttemptLimiter } from './auth/login-attempt-limiter.js';
import { createRequireUser } from './auth/require-user.js';
import type { AppConfig } from './config.js';
import { registerOriginGuard } from './security/origin-guard.js';
import { registerPhotoUploadRoutes } from './photos/photo-upload-routes.js';
import type { PhotoUploadService } from './photos/photo-upload-service.js';
import { registerPhotoQueryRoutes } from './photos/photo-query-routes.js';
import { registerPhotoMediaRoutes } from './photos/photo-media-routes.js';
import { registerAlbumRoutes } from './albums/album-routes.js';
import { registerAlbumPhotoRoutes } from './albums/album-photo-routes.js';
import type { AlbumPhotoRepository } from '@memory/db';

export type AppDependencies = {
  config: AppConfig;
  users: UserRepository;
  sessions: SessionRepository;
  photoUploads: PhotoUploadService;
  photos: PhotoRepository;
  uploads: UploadRepository;
  albums: AlbumRepository;
  albumPhotos: AlbumPhotoRepository;
  albumYearSettings: AlbumYearSettingsRepository;
  media: Pick<MediaStorage, 'createReadStream'>;
  clock?: () => Date;
};

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ status: 'ok' as const }));
  void app.register(async (application) => {
    await application.register(cookie);
    await application.register(multipart, {
      limits: {
        fileSize: dependencies.config.maxUploadBytes,
        files: 2,
        fields: 0,
        parts: 2,
      },
      throwFileSizeLimit: true,
    });
    application.decorateRequest('user', null);
    registerOriginGuard(application, dependencies.config);

    const clock = dependencies.clock ?? (() => new Date());
    const loginAttempts = createLoginAttemptLimiter();
    const auth = createAuthService({
      users: dependencies.users,
      sessions: dependencies.sessions,
      clock,
    });
    registerAuthRoutes(application, {
      config: dependencies.config,
      auth,
      clock,
      loginAttempts,
    });
    registerPhotoUploadRoutes(application, {
      sessions: dependencies.sessions,
      service: dependencies.photoUploads,
      clock,
    });
    registerPhotoQueryRoutes(application, {
      sessions: dependencies.sessions,
      photos: dependencies.photos,
      uploads: dependencies.uploads,
      clock,
    });
    registerPhotoMediaRoutes(application, {
      sessions: dependencies.sessions,
      photos: dependencies.photos,
      media: dependencies.media,
      clock,
    });
    registerAlbumRoutes(application, {
      sessions: dependencies.sessions,
      albums: dependencies.albums,
      albumYearSettings: dependencies.albumYearSettings,
      clock,
    });
    registerAlbumPhotoRoutes(application, {
      sessions: dependencies.sessions, albums: dependencies.albums,
      albumPhotos: dependencies.albumPhotos, clock,
    });

    application.get(
      '/api/private/ping',
      { preHandler: createRequireUser(dependencies.sessions, clock) },
      async () => ({ message: 'authenticated' as const }),
    );
  });
  return app;
}
