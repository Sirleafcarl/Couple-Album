import { isAbsolute, relative, resolve, sep } from 'node:path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_EXTENSIONS = new Set(['jpg', 'png', 'webp', 'heic']);

export type StoredImageExtension = 'jpg' | 'png' | 'webp' | 'heic';

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error('Invalid media path identity');
  }
}

export function stagingPathFor(uploadId: string): string {
  assertUuid(uploadId);
  return `staging/${uploadId.toLowerCase()}.part`;
}

export function createPhotoPaths(input: {
  ownerId: string;
  photoId: string;
  extension: StoredImageExtension;
}): { original: string; preview: string; thumbnail: string } {
  assertUuid(input.ownerId);
  assertUuid(input.photoId);
  if (!IMAGE_EXTENSIONS.has(input.extension)) {
    throw new Error('Invalid media path identity');
  }

  const ownerId = input.ownerId.toLowerCase();
  const photoId = input.photoId.toLowerCase();
  const compactPhotoId = photoId.replaceAll('-', '');
  const shard = `${compactPhotoId.slice(0, 2)}/${compactPhotoId.slice(2, 4)}`;
  const base = `${ownerId}/${shard}/${photoId}`;

  return {
    original: `originals/${base}.${input.extension}`,
    preview: `previews/${base}.webp`,
    thumbnail: `thumbnails/${base}.webp`,
  };
}

export function resolveBelowRoot(dataRoot: string, relativePath: string): string {
  if (
    relativePath.length === 0
    || isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.includes('\0')
  ) {
    throw new Error('Invalid relative media path');
  }

  const root = resolve(dataRoot);
  const target = resolve(root, relativePath);
  const fromRoot = relative(root, target);
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('Invalid relative media path');
  }

  return target;
}
