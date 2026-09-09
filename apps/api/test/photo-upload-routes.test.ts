import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { PhotoUploadService } from '../src/photos/photo-upload-service.js';
import { PhotoUploadError } from '../src/photos/photo-errors.js';
import { buildApp, type AppDependencies } from '../src/app.js';
import { createUnusedDependencies } from './test-dependencies.js';

const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'alice@example.com',
  displayName: 'Alice',
};

function multipart(files: Array<{ filename: string; bytes: Buffer }>): {
  boundary: string;
  payload: Buffer;
} {
  const boundary = '----memory-test-boundary';
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ));
    chunks.push(file.bytes, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, payload: Buffer.concat(chunks) };
}

function createApp(input: {
  service?: PhotoUploadService;
  maxUploadBytes?: number;
  authenticated?: boolean;
} = {}) {
  const base = createUnusedDependencies();
  const service = input.service ?? {
    async upload(value) {
      for await (const _chunk of value.source) {
        // Consume the real multipart stream so parser limits and cleanup run.
      }
      return {
        uploadId: '019cfff0-3e23-7d99-a3df-eabc920fd497',
        photoId: '019cfff0-3e23-7d99-a3df-eabc920fd499',
        status: 'processing' as const,
      };
    },
  };
  return buildApp({
    ...base,
    config: {
      ...base.config,
      maxUploadBytes: input.maxUploadBytes ?? 1024,
    },
    sessions: {
      ...base.sessions,
      async findActiveByTokenHash() {
        return input.authenticated === false ? null : user;
      },
    },
    photoUploads: service,
  } as AppDependencies);
}

function uploadHeaders(boundary: string, origin = 'http://localhost:5173') {
  return {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    cookie: 'memory_session=test-token',
    origin,
  };
}

describe('POST /api/photos/uploads', () => {
  it('requires an authenticated session', async () => {
    const app = createApp({ authenticated: false });
    const body = multipart([{ filename: 'photo.png', bytes: Buffer.from('image') }]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads',
      headers: uploadHeaders(body.boundary),
      payload: body.payload,
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('rejects a cross-origin upload before consuming it', async () => {
    const app = createApp();
    const body = multipart([{ filename: 'photo.png', bytes: Buffer.from('image') }]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads',
      headers: uploadHeaders(body.boundary, 'https://attacker.example'),
      payload: body.payload,
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'INVALID_ORIGIN' });
  });

  it('requires exactly one file part', async () => {
    const app = createApp();
    const empty = multipart([]);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads',
      headers: uploadHeaders(empty.boundary),
      payload: empty.payload,
    });
    const multipleBody = multipart([
      { filename: 'first.png', bytes: Buffer.from('first') },
      { filename: 'second.png', bytes: Buffer.from('second') },
    ]);
    const multiple = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads',
      headers: uploadHeaders(multipleBody.boundary),
      payload: multipleBody.payload,
    });
    await app.close();

    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({ error: 'PHOTO_FILE_REQUIRED' });
    expect(multiple.statusCode).toBe(400);
    expect(multiple.json()).toEqual({ error: 'MULTIPART_LIMIT' });
  });

  it('returns stable service errors', async () => {
    const app = createApp({
      service: {
        async upload() {
          throw new PhotoUploadError('UNSUPPORTED_IMAGE', 415, 'Unsupported image');
        },
      },
    });
    const body = multipart([{ filename: 'notes.txt', bytes: Buffer.from('text') }]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads',
      headers: uploadHeaders(body.boundary),
      payload: body.payload,
    });
    await app.close();

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({ error: 'UNSUPPORTED_IMAGE' });
  });

  it('reports a non-multipart request as malformed input', async () => {
    const app = createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads',
      headers: {
        'content-type': 'application/json',
        cookie: 'memory_session=test-token',
        origin: 'http://localhost:5173',
      },
      payload: '{}',
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'MALFORMED_MULTIPART' });
  });

  it('enforces the configured file byte limit', async () => {
    const app = createApp({ maxUploadBytes: 4 });
    const body = multipart([{ filename: 'large.png', bytes: Buffer.from('12345') }]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads',
      headers: uploadHeaders(body.boundary),
      payload: body.payload,
    });
    await app.close();

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'UPLOAD_TOO_LARGE' });
  });

  it('passes the explicit duplicate choice and returns accepted ids', async () => {
    let allowDuplicate: boolean | null = null;
    let received = Buffer.alloc(0);
    const app = createApp({
      service: {
        async upload(value) {
          allowDuplicate = value.allowDuplicate;
          const chunks: Buffer[] = [];
          for await (const chunk of value.source as Readable) chunks.push(Buffer.from(chunk));
          received = Buffer.concat(chunks);
          return {
            uploadId: '019cfff0-3e23-7d99-a3df-eabc920fd497',
            photoId: '019cfff0-3e23-7d99-a3df-eabc920fd499',
            status: 'processing',
          };
        },
      },
    });
    const body = multipart([{ filename: 'photo.png', bytes: Buffer.from('image bytes') }]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/uploads?allowDuplicate=true',
      headers: uploadHeaders(body.boundary),
      payload: body.payload,
    });
    await app.close();

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      uploadId: '019cfff0-3e23-7d99-a3df-eabc920fd497',
      photoId: '019cfff0-3e23-7d99-a3df-eabc920fd499',
      status: 'processing',
    });
    expect(allowDuplicate).toBe(true);
    expect(received.toString()).toBe('image bytes');
  });
});
