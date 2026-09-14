import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('users_email_unique').on(table.email)]);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
  index('sessions_user_id_index').on(table.userId),
  index('sessions_expires_at_index').on(table.expiresAt),
]);

export const photoStatus = pgEnum('photo_status', ['processing', 'ready', 'failed']);
export const uploadStatus = pgEnum('upload_status', [
  'receiving',
  'committed',
  'duplicate',
  'failed',
]);
export const jobStatus = pgEnum('job_status', [
  'queued',
  'running',
  'retry',
  'completed',
  'failed',
]);
export const jobType = pgEnum('job_type', ['process_photo']);

export const photos = pgTable('photos', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  originalPath: text('original_path').notNull(),
  previewPath: text('preview_path'),
  thumbnailPath: text('thumbnail_path'),
  originalFilename: text('original_filename').notNull(),
  contentHash: text('content_hash').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  width: integer('width'),
  height: integer('height'),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  status: photoStatus('status').notNull().default('processing'),
  failureCode: text('failure_code'),
  purgeStartedAt: timestamp('purge_started_at', { withTimezone: true }),
  sortAt: timestamp('sort_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('photos_active_sort_index')
    .on(table.sortAt.desc().nullsFirst(), table.id.desc().nullsFirst())
    .where(sql`${table.deletedAt} is null`),
  index('photos_owner_active_sort_index')
    .on(table.ownerId, table.sortAt.desc().nullsFirst(), table.id.desc().nullsFirst())
    .where(sql`${table.deletedAt} is null`),
  index('photos_status_sort_index').on(table.status, table.sortAt.desc(), table.id.desc()),
  index('photos_owner_status_sort_index').on(
    table.ownerId,
    table.status,
    table.sortAt.desc(),
    table.id.desc(),
  ),
  index('photos_owner_hash_index').on(table.ownerId, table.contentHash),
  index('photos_trash_expiry_index').on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
]);

export const uploads = pgTable('uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  originalFilename: text('original_filename').notNull(),
  status: uploadStatus('status').notNull().default('receiving'),
  stagingPath: text('staging_path'),
  bytesReceived: bigint('bytes_received', { mode: 'number' }).notNull().default(0),
  contentHash: text('content_hash'),
  errorCode: text('error_code'),
  photoId: uuid('photo_id').references(() => photos.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProcessPhotoJobPayload = { photoId: string };

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: jobType('type').notNull(),
  payload: jsonb('payload').$type<ProcessPhotoJobPayload>().notNull(),
  status: jobStatus('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('jobs_status_next_run_index').on(table.status, table.nextRunAt),
]);

// Retired enum values remain for database compatibility only; repository reads normalize them.
// New settings accept only AlbumThemeIdSchema values.
export const albumThemeId = pgEnum('album_theme_id', [
  'secret-garden',
  'love-letters',
  'date-adventure',
  'daylight',
  'heart-frequency',
  'sacred-joy',
  'love-playground',
  'blue-holiday',
  'cloud-candy',
  'tropical-cutout',
  'clear-specimen',
  'photo-exhibition',
  'heart-track',
  'sky-letters',
  'kitty-dream',
  'kitty-gallery',
  'fairytale-castle',
]);

export const albums = pgTable('albums', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  wallVersion: integer('wall_version').notNull().default(1),
  layout: text('layout').$type<'story' | 'garden' | 'film'>().notNull().default('story'),
  manualOrder: boolean('manual_order').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  check('albums_version_positive', sql`${table.version} > 0`),
  check('albums_wall_version_positive', sql`${table.wallVersion} > 0`),
  check('albums_layout_valid', sql`${table.layout} in ('story', 'garden', 'film')`),
  index('albums_active_occurred_index')
    .on(table.occurredOn.desc(), table.id.desc())
    .where(sql`${table.deletedAt} is null`),
]);

export const albumPhotos = pgTable('album_photos', {
  albumId: uuid('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  photoId: uuid('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
  sortAt: timestamp('sort_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('album_photos_membership_unique').on(table.albumId, table.photoId),
  index('album_photos_position_index').on(table.albumId, table.position),
  index('album_photos_photo_index').on(table.photoId),
]);

export const albumYearSettings = pgTable('album_year_settings', {
  year: integer('year').primaryKey(),
  themeId: albumThemeId('theme_id').notNull(),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('album_year_settings_year_range', sql`${table.year} between 1000 and 9999`),
  check('album_year_settings_version_positive', sql`${table.version} > 0`),
]);
