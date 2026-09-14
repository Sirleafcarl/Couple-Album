import { expect, it, vi } from 'vitest';
import { createPhotoPaths } from '@memory/media';
import { removeTrashedPhotoFiles } from '../src/photo-trash-cleanup.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const paths = createPhotoPaths({ ownerId, photoId: id, extension: 'jpg' });
const photo = { id, ownerId, mimeType: 'image/jpeg', originalPath: paths.original, previewPath: paths.preview, thumbnailPath: paths.thumbnail };
it('removes exact original and deterministic derivatives even when processing did not commit paths', async () => {
  const removeIfPresent = vi.fn(async (_path: string) => {});
  await removeTrashedPhotoFiles({ ...photo, previewPath: null, thumbnailPath: null }, { removeIfPresent });
  expect(removeIfPresent.mock.calls.map(args => args[0])).toEqual([paths.original, paths.preview, paths.thumbnail]);
});
it.each(['../../private.jpg', '/tmp/private.jpg', paths.original.replace(id, ownerId)])('rejects mismatched path %s before deleting anything', async originalPath => {
  const removeIfPresent = vi.fn(async () => {});
  await expect(removeTrashedPhotoFiles({ ...photo, originalPath }, { removeIfPresent })).rejects.toThrow('identity');
  expect(removeIfPresent).not.toHaveBeenCalled();
});
it('propagates storage errors so purge intent is retained for retry', async () => {
  const removeIfPresent = vi.fn(async () => { throw new Error('EACCES'); });
  await expect(removeTrashedPhotoFiles(photo, { removeIfPresent })).rejects.toThrow('EACCES');
});
