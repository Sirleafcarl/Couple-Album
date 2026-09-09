import { describe, expect, it } from 'vitest';
import {
  DuplicatePhotoResponseSchema,
  PhotoListQuerySchema,
  PhotoListResponseSchema,
  PhotoStatusSchema,
  UploadStatusSchema,
  decodePhotoCursor,
  encodePhotoCursor,
} from '../src/photos.js';

const photoId = '019cfff0-3e23-7d99-a3df-eabc920fd499';
const ownerId = '019cfff0-3e23-7d99-a3df-eabc920fd498';

describe('photo contracts', () => {
  it('accepts only persisted photo and upload states', () => {
    expect(PhotoStatusSchema.options).toEqual(['processing', 'ready', 'failed']);
    expect(UploadStatusSchema.options).toEqual([
      'receiving',
      'committed',
      'duplicate',
      'failed',
    ]);
    expect(PhotoStatusSchema.safeParse('deleted').success).toBe(false);
  });

  it('applies a bounded default photo page size', () => {
    expect(PhotoListQuerySchema.parse({ owner: 'all' })).toEqual({
      owner: 'all',
      limit: 40,
    });
    expect(PhotoListQuerySchema.safeParse({ owner: 'all', limit: 0 }).success).toBe(false);
    expect(PhotoListQuerySchema.safeParse({ owner: 'all', limit: 101 }).success).toBe(false);
    expect(PhotoListQuerySchema.safeParse({ owner: 'somebody' }).success).toBe(false);
  });

  it('round-trips a cursor and rejects malformed cursor input', () => {
    const value = { sortAt: '2026-09-02T03:04:05.000Z', id: photoId };
    const encoded = encodePhotoCursor(value);

    expect(encoded).not.toContain('{');
    expect(decodePhotoCursor(encoded)).toEqual(value);
    expect(() => decodePhotoCursor('not-base64url!')).toThrow('Invalid photo cursor');
  });

  it('validates public list output without physical storage paths', () => {
    const result = PhotoListResponseSchema.parse({
      items: [{
        id: photoId,
        owner: {
          id: ownerId,
          displayName: '小叶',
        },
        originalFilename: 'lake.jpg',
        status: 'ready',
        width: 2048,
        height: 1365,
        capturedAt: '2026-08-01T08:00:00.000Z',
        sortAt: '2026-08-01T08:00:00.000Z',
        failureCode: null,
        media: {
          original: `/api/photos/${photoId}/media/original`,
          preview: `/api/photos/${photoId}/media/preview`,
          thumbnail: `/api/photos/${photoId}/media/thumbnail`,
        },
      }],
      nextCursor: null,
    });

    expect(JSON.stringify(result)).not.toContain('originals/');
    expect(PhotoListResponseSchema.safeParse({
      ...result,
      items: [{ ...result.items[0], originalPath: 'originals/private.jpg' }],
    }).success).toBe(false);
  });

  it('requires the existing photo id in duplicate conflicts', () => {
    expect(DuplicatePhotoResponseSchema.parse({
      error: 'DUPLICATE_PHOTO',
      existingPhotoId: photoId,
      upload: {
        id: '019cfff0-3e23-7d99-a3df-eabc920fd497',
        originalFilename: 'lake-copy.jpg',
        status: 'duplicate',
        bytesReceived: 1234,
        errorCode: 'DUPLICATE_PHOTO',
        photoId: null,
        createdAt: '2026-09-02T03:04:05.000Z',
      },
    }).existingPhotoId).toBe(photoId);
  });
});
