import {
  PhotoListResponseSchema,
  UploadSummarySchema,
  TrashListResponseSchema,
  type PhotoListResponse,
  type UploadSummary,
} from '@memory/contracts/photos';

export type PhotoUploadResult = {
  uploadId: string;
  photoId: string;
  status: 'processing';
};

export class PhotoApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(code);
    this.name = 'PhotoApiError';
  }
}

export async function getTrash(cursor?: string) {
  const query = new URLSearchParams({ limit: '40' });
  if (cursor) query.set('cursor', cursor);
  const response = await fetch(`/api/trash?${query}`, { credentials: 'include' });
  if (!response.ok) throw new Error('TRASH_LIST_FAILED');
  return TrashListResponseSchema.parse(await response.json());
}

export async function trashPhoto(id: string) {
  const response = await fetch(`/api/photos/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok) throw new Error('PHOTO_DELETE_FAILED');
}

export async function restorePhoto(id: string) {
  const response = await fetch(`/api/trash/${id}/restore`, { method: 'POST', credentials: 'include' });
  if (!response.ok) {
    const body = await response.json() as { error?: string };
    throw new PhotoApiError(body.error ?? 'RESTORE_FAILED', response.status, null);
  }
}

export async function getPhotos(input: {
  owner: string;
  cursor?: string;
}): Promise<PhotoListResponse> {
  const query = new URLSearchParams({ owner: input.owner, limit: '40' });
  if (input.cursor) query.set('cursor', input.cursor);
  const response = await fetch(`/api/photos?${query}`, { credentials: 'include' });
  if (!response.ok) throw new Error('PHOTO_LIST_FAILED');
  return PhotoListResponseSchema.parse(await response.json());
}

export async function getUploads(): Promise<{ items: UploadSummary[] }> {
  const response = await fetch('/api/uploads?limit=40', { credentials: 'include' });
  if (!response.ok) throw new Error('UPLOAD_LIST_FAILED');
  const body = await response.json() as { items?: unknown[] };
  return { items: (body.items ?? []).map((item) => UploadSummarySchema.parse(item)) };
}

export function uploadPhoto(
  file: File,
  options: {
    allowDuplicate?: boolean;
    signal?: AbortSignal;
    onProgress?: (percentage: number) => void;
  } = {},
): Promise<PhotoUploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const allowDuplicate = options.allowDuplicate === true;
    request.open('POST', `/api/photos/uploads?allowDuplicate=${String(allowDuplicate)}`);
    request.withCredentials = true;

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener('load', () => {
      let body: unknown;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        body = null;
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(body as PhotoUploadResult);
        return;
      }
      const code = typeof body === 'object' && body !== null && 'error' in body
        ? String(body.error)
        : 'UPLOAD_FAILED';
      reject(new PhotoApiError(code, request.status, body));
    });
    request.addEventListener('error', () => reject(new PhotoApiError('UPLOAD_FAILED', 0, null)));
    request.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')));

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'));
        return;
      }
      options.signal.addEventListener('abort', () => request.abort(), { once: true });
    }

    const form = new FormData();
    form.append('file', file);
    request.send(form);
  });
}
