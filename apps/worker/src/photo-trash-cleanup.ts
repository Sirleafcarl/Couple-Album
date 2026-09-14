import { createPhotoPaths, type MediaStorage, type StoredImageExtension } from '@memory/media';

type PurgePhoto = {
  id: string; ownerId: string; mimeType: string;
  originalPath: string; previewPath: string | null; thumbnailPath: string | null;
};

export async function removeTrashedPhotoFiles(photo: PurgePhoto, storage: Pick<MediaStorage, 'removeIfPresent'>): Promise<void> {
  const extensions: Record<string, StoredImageExtension> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
  const extension = extensions[photo.mimeType];
  if (!extension) throw new Error('Invalid photo media identity');
  const expected = createPhotoPaths({ ownerId: photo.ownerId, photoId: photo.id, extension });
  // Validate every path before the first unlink. Never accept user filenames,
  // another photo's path, directories, wildcards, or recursive removal.
  if (photo.originalPath !== expected.original
    || (photo.previewPath !== null && photo.previewPath !== expected.preview)
    || (photo.thumbnailPath !== null && photo.thumbnailPath !== expected.thumbnail)) {
    throw new Error('Invalid photo media identity');
  }
  for (const path of [expected.original, expected.preview, expected.thumbnail]) await storage.removeIfPresent(path);
}
