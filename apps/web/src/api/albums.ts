import {
  AlbumListResponseSchema,
  AlbumDetailSchema,
  type AlbumDetail,
  type AlbumLayout,
  AlbumSummarySchema,
  AlbumThemeSettingSchema,
  type AlbumListResponse,
  type AlbumSummary,
  type AlbumThemeSetting,
  type CreateAlbumInput,
  type UpdateAlbumInput,
  type UpdateAlbumThemeInput,
} from '@memory/contracts/albums';
import { z } from 'zod';

export class AlbumApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(code);
    this.name = 'AlbumApiError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return 'ALBUM_REQUEST_FAILED';
  }
  return typeof body.error === 'string' ? body.error : 'ALBUM_REQUEST_FAILED';
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const request: RequestInit = {
    credentials: 'include',
    headers,
    method: init.method,
  };
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    request.body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(path, request);
  } catch {
    throw new AlbumApiError('ALBUM_REQUEST_FAILED', 0, null);
  }
  const body = await readJson(response);
  if (!response.ok) {
    throw new AlbumApiError(readErrorCode(body), response.status, body);
  }
  return schema.parse(body);
}

export function getAlbums(): Promise<AlbumListResponse> {
  return requestJson('/api/albums', AlbumListResponseSchema, { method: 'GET' });
}

export function getAlbum(id: string, offset = 0, version?: number): Promise<AlbumDetail> {
  const query = new URLSearchParams({ offset: String(offset), limit: '40' });
  if (version !== undefined) query.set('version', String(version));
  return requestJson(`/api/albums/${encodeURIComponent(id)}?${query}`, AlbumDetailSchema, { method: 'GET' });
}
const okSchema = z.strictObject({ ok: z.literal(true) });
export function addAlbumPhotos(id: string, photoIds: string[]) {
  return requestJson(`/api/albums/${encodeURIComponent(id)}/photos`, okSchema, { method: 'POST', body: { photoIds } });
}
export function removeAlbumPhoto(id: string, photoId: string, version: number) {
  return requestJson(`/api/albums/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`, okSchema, { method: 'DELETE', body: { version } });
}
export function setAlbumLayout(id: string, layout: AlbumLayout, version: number) {
  return requestJson(`/api/albums/${encodeURIComponent(id)}/layout`, okSchema, { method: 'PUT', body: { layout, version } });
}
export function moveAlbumPhoto(id: string, photoId: string, beforePhotoId: string | null, version: number) {
  return requestJson(`/api/albums/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}/order`, okSchema, { method: 'PUT', body: { beforePhotoId, version } });
}

export function createAlbum(input: CreateAlbumInput): Promise<AlbumSummary> {
  return requestJson('/api/albums', AlbumSummarySchema, { method: 'POST', body: input });
}

export function updateAlbum(id: string, input: UpdateAlbumInput): Promise<AlbumSummary> {
  return requestJson(`/api/albums/${encodeURIComponent(id)}`, AlbumSummarySchema, {
    method: 'PATCH', body: input,
  });
}

export function updateAlbumTheme(
  year: number,
  input: UpdateAlbumThemeInput,
): Promise<AlbumThemeSetting> {
  return requestJson(`/api/album-years/${year}/theme`, AlbumThemeSettingSchema, {
    method: 'PUT', body: input,
  });
}
