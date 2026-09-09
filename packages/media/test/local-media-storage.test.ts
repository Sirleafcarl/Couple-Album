import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaStorageError, createLocalMediaStorage } from '../src/local-media-storage.js';

const uploadId = '019cfff0-3e23-7d99-a3df-eabc920fd497';
const ownerId = '10000000-0000-4000-8000-000000000001';
const photoId = '019cfff0-3e23-7d99-a3df-eabc920fd499';
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'memory-media-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local media storage', () => {
  it('creates every persistent media directory', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({
      dataRoot,
      maxUploadBytes: 100,
      minFreeBytes: 1,
    });

    await storage.ensureLayout();

    expect((await readdir(dataRoot)).sort()).toEqual([
      'originals',
      'previews',
      'staging',
      'thumbnails',
    ]);
  });

  it('streams staging bytes while calculating exact size and SHA-256', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();

    const result = await storage.writeStaging(
      uploadId,
      Readable.from([Buffer.from('hello'), Buffer.from(' world')]),
    );

    expect(result).toEqual({
      stagingPath: `staging/${uploadId}.part`,
      sizeBytes: 11,
      sha256: createHash('sha256').update('hello world').digest('hex'),
    });
    expect(await readFile(join(dataRoot, result.stagingPath), 'utf8')).toBe('hello world');
  });

  it.each([
    ['an empty upload', Readable.from([]), 'EMPTY_UPLOAD'],
    ['an oversized upload', Readable.from([Buffer.from('12345')]), 'UPLOAD_TOO_LARGE'],
  ])('removes staging after %s', async (_name, source, code) => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 4, minFreeBytes: 1 });
    await storage.ensureLayout();

    await expect(storage.writeStaging(uploadId, source)).rejects.toMatchObject({ code });
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
  });

  it('removes a partial staging file when the source stream fails', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();
    const source = Readable.from((async function* () {
      yield Buffer.from('partial');
      throw new Error('connection reset');
    })());

    await expect(storage.writeStaging(uploadId, source)).rejects.toThrow('connection reset');
    expect(await readdir(join(dataRoot, 'staging'))).toEqual([]);
  });

  it('rejects writes that would consume the configured free-space reserve', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({
      dataRoot,
      maxUploadBytes: 100,
      minFreeBytes: Number.MAX_SAFE_INTEGER,
    });
    await storage.ensureLayout();

    await expect(storage.assertCapacity(1)).rejects.toEqual(
      expect.objectContaining<Partial<MediaStorageError>>({ code: 'INSUFFICIENT_STORAGE' }),
    );
  });

  it('detects image type from staged magic bytes instead of the filename', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();
    await storage.writeStaging(
      uploadId,
      Readable.from([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')]),
    );

    await expect(storage.inspectStaged(`staging/${uploadId}.part`)).resolves.toEqual({
      extension: 'png',
      mimeType: 'image/png',
    });
  });

  it('atomically commits and can roll an original back to staging', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();
    const staged = await storage.writeStaging(uploadId, Readable.from([Buffer.from('original')]));

    const originalPath = await storage.commitOriginal({
      stagingPath: staged.stagingPath,
      ownerId,
      photoId,
      extension: 'jpg',
    });
    expect(await readFile(join(dataRoot, originalPath), 'utf8')).toBe('original');

    await storage.moveOriginalBack(originalPath, staged.stagingPath);
    expect(await readFile(join(dataRoot, staged.stagingPath), 'utf8')).toBe('original');
  });

  it('does not overwrite staging when rolling an original back', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();
    const staged = await storage.writeStaging(uploadId, Readable.from([Buffer.from('original')]));
    const originalPath = await storage.commitOriginal({
      stagingPath: staged.stagingPath,
      ownerId,
      photoId,
      extension: 'jpg',
    });
    await storage.writeStaging(uploadId, Readable.from([Buffer.from('new staging')]));

    await expect(storage.moveOriginalBack(originalPath, staged.stagingPath)).rejects.toMatchObject({
      code: 'MEDIA_PATH_EXISTS',
    });
    expect(await readFile(join(dataRoot, originalPath), 'utf8')).toBe('original');
    expect(await readFile(join(dataRoot, staged.stagingPath), 'utf8')).toBe('new staging');
  });

  it('publishes a complete derivative without leaving temporary siblings', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();
    const relativePath = `thumbnails/${ownerId}/01/9c/${photoId}.webp`;

    await storage.writeDerivativeAtomically(relativePath, Buffer.from('webp-result'));

    expect(await readFile(join(dataRoot, relativePath), 'utf8')).toBe('webp-result');
    expect((await readdir(join(dataRoot, `thumbnails/${ownerId}/01/9c`))).sort()).toEqual([
      `${photoId}.webp`,
    ]);
  });

  it('rejects a symbolic-link parent that escapes the data root', async () => {
    const dataRoot = await temporaryRoot();
    const outside = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();
    await mkdir(join(dataRoot, 'thumbnails', ownerId), { recursive: true });
    await symlink(outside, join(dataRoot, 'thumbnails', ownerId, '01'));

    await expect(storage.writeDerivativeAtomically(
      `thumbnails/${ownerId}/01/9c/${photoId}.webp`,
      Buffer.from('escape'),
    )).rejects.toMatchObject({ code: 'INVALID_MEDIA_PATH' });
    expect(await readdir(outside)).toEqual([]);
  });

  it('does not stream through a symbolic link that escapes the data root', async () => {
    const dataRoot = await temporaryRoot();
    const outside = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();
    await writeFile(join(outside, 'private.jpg'), 'outside secret');
    await symlink(outside, join(dataRoot, 'originals', 'escaped'));

    expect(() => storage.createReadStream('originals/escaped/private.jpg')).toThrow(
      'Media path escapes the data root',
    );
  });

  it('does not create parent directories while removing an absent path', async () => {
    const dataRoot = await temporaryRoot();
    const storage = createLocalMediaStorage({ dataRoot, maxUploadBytes: 100, minFreeBytes: 1 });
    await storage.ensureLayout();

    await storage.removeIfPresent('previews/absent/01/9c/photo.webp');

    expect(await readdir(join(dataRoot, 'previews'))).toEqual([]);
  });
});
