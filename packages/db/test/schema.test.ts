import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { albums, albumYearSettings, jobs, photos, sessions, uploads, users } from '../src/schema.js';

describe('auth schema', () => {
  it('exports stable table names', () => {
    expect(getTableName(users)).toBe('users');
    expect(getTableName(sessions)).toBe('sessions');
  });
});

describe('photo ingestion schema', () => {
  it('exports stable media table names', () => {
    expect(getTableName(photos)).toBe('photos');
    expect(getTableName(uploads)).toBe('uploads');
    expect(getTableName(jobs)).toBe('jobs');
  });

  it('keeps immutable originals and derivative state on photos', () => {
    const config = getTableConfig(photos);

    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'owner_id',
      'original_path',
      'preview_path',
      'thumbnail_path',
      'original_filename',
      'content_hash',
      'mime_type',
      'size_bytes',
      'width',
      'height',
      'captured_at',
      'status',
      'failure_code',
      'purge_started_at',
      'sort_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.indexes.map((index) => index.config.name)).toEqual([
      'photos_active_sort_index',
      'photos_owner_active_sort_index',
      'photos_status_sort_index',
      'photos_owner_status_sort_index',
      'photos_owner_hash_index',
      'photos_trash_expiry_index',
    ]);
    expect(config.indexes.every((index) => index.config.unique === false)).toBe(true);
  });

  it('records upload lifecycle and durable processing jobs', () => {
    const uploadConfig = getTableConfig(uploads);
    const jobConfig = getTableConfig(jobs);

    expect(uploadConfig.columns.map((column) => column.name)).toEqual([
      'id',
      'owner_id',
      'original_filename',
      'status',
      'staging_path',
      'bytes_received',
      'content_hash',
      'error_code',
      'photo_id',
      'created_at',
      'updated_at',
    ]);
    expect(uploadConfig.foreignKeys).toHaveLength(2);
    expect(jobConfig.columns.map((column) => column.name)).toEqual([
      'id',
      'type',
      'payload',
      'status',
      'attempts',
      'max_attempts',
      'next_run_at',
      'locked_at',
      'locked_by',
      'last_error',
      'created_at',
      'updated_at',
    ]);
    expect(jobConfig.indexes.map((index) => index.config.name)).toEqual([
      'jobs_status_next_run_index',
    ]);
  });
});

describe('album schema', () => {
  it('exports stable shared album table names and version columns', () => {
    expect(getTableName(albums)).toBe('albums');
    expect(getTableName(albumYearSettings)).toBe('album_year_settings');
    expect(getTableConfig(albums).columns.map((column) => column.name)).toContain('version');
    expect(getTableConfig(albumYearSettings).columns.map((column) => column.name)).toContain('theme_id');
  });
});
