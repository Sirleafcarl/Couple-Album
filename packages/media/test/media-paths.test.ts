import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPhotoPaths,
  resolveBelowRoot,
  stagingPathFor,
} from '../src/media-paths.js';

const ownerId = '10000000-0000-4000-8000-000000000001';
const photoId = '019cfff0-3e23-7d99-a3df-eabc920fd499';
const uploadId = '019cfff0-3e23-7d99-a3df-eabc920fd497';

describe('media paths', () => {
  it('shards every photo variant by the first four hexadecimal id characters', () => {
    expect(createPhotoPaths({ ownerId, photoId, extension: 'jpg' })).toEqual({
      original: `originals/${ownerId}/01/9c/${photoId}.jpg`,
      preview: `previews/${ownerId}/01/9c/${photoId}.webp`,
      thumbnail: `thumbnails/${ownerId}/01/9c/${photoId}.webp`,
    });
    expect(stagingPathFor(uploadId)).toBe(`staging/${uploadId}.part`);
  });

  it.each([
    { ownerId: '../outside', photoId, extension: 'jpg' as const },
    { ownerId, photoId: '../../outside', extension: 'jpg' as const },
    { ownerId, photoId, extension: '../jpg' as 'jpg' },
  ])('rejects invalid path identity input %#', (input) => {
    expect(() => createPhotoPaths(input)).toThrow('Invalid media path identity');
  });

  it.each(['/etc/passwd', '../outside', 'originals/../../outside', ''])(
    'rejects a path outside the configured root: %s',
    (relativePath) => {
      expect(() => resolveBelowRoot('/srv/memory-data', relativePath)).toThrow(
        'Invalid relative media path',
      );
    },
  );

  it('resolves a normalized relative path below the root', () => {
    expect(resolveBelowRoot('/srv/memory-data', `originals/${ownerId}/photo.jpg`)).toBe(
      resolve('/srv/memory-data', `originals/${ownerId}/photo.jpg`),
    );
  });
});
