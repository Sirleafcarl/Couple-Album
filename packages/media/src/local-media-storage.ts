import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  createReadStream,
  createWriteStream,
  realpathSync,
} from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  statfs,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileTypeFromFile } from 'file-type';
import { MediaStorageError } from './errors.js';
import {
  createPhotoPaths,
  resolveBelowRoot,
  stagingPathFor,
  type StoredImageExtension,
} from './media-paths.js';

export { MediaStorageError } from './errors.js';

export type StoredUpload = {
  stagingPath: string;
  sizeBytes: number;
  sha256: string;
};

export type DetectedImage = {
  extension: StoredImageExtension;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
};

export type MediaStorage = {
  ensureLayout(): Promise<void>;
  assertCapacity(requiredBytes: number): Promise<void>;
  writeStaging(uploadId: string, source: Readable): Promise<StoredUpload>;
  inspectStaged(stagingPath: string): Promise<DetectedImage>;
  commitOriginal(input: {
    stagingPath: string;
    ownerId: string;
    photoId: string;
    extension: StoredImageExtension;
  }): Promise<string>;
  moveOriginalBack(originalPath: string, stagingPath: string): Promise<void>;
  writeDerivativeAtomically(relativePath: string, bytes: Uint8Array): Promise<void>;
  createReadStream(relativePath: string): Readable;
  removeIfPresent(relativePath: string): Promise<void>;
};

type LocalMediaStorageOptions = {
  dataRoot: string;
  maxUploadBytes: number;
  minFreeBytes: number;
};

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isExisting(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function assertRealPathBelowRoot(root: string, candidate: string): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new MediaStorageError('INVALID_MEDIA_PATH', 'Media path escapes the data root');
  }
}

export function createLocalMediaStorage(options: LocalMediaStorageOptions): MediaStorage {
  const dataRoot = resolve(options.dataRoot);

  async function ensureSafeParent(relativePath: string): Promise<string> {
    let target: string;
    try {
      target = resolveBelowRoot(dataRoot, relativePath);
    } catch (error) {
      throw new MediaStorageError('INVALID_MEDIA_PATH', 'Invalid media path', { cause: error });
    }

    const rootRealPath = await realpath(dataRoot);
    const parentRelative = relative(dataRoot, dirname(target));
    let current = dataRoot;
    for (const segment of parentRelative.split(sep).filter(Boolean)) {
      current = resolve(current, segment);
      try {
        const entry = await lstat(current);
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          throw new MediaStorageError('INVALID_MEDIA_PATH', 'Media parent is not a directory');
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
        await mkdir(current);
      }
      assertRealPathBelowRoot(rootRealPath, await realpath(current));
    }
    return target;
  }

  async function safeExistingPath(relativePath: string): Promise<string> {
    let target: string;
    try {
      target = resolveBelowRoot(dataRoot, relativePath);
    } catch (error) {
      throw new MediaStorageError('INVALID_MEDIA_PATH', 'Invalid media path', { cause: error });
    }
    const rootRealPath = await realpath(dataRoot);
    try {
      assertRealPathBelowRoot(rootRealPath, await realpath(dirname(target)));
      assertRealPathBelowRoot(rootRealPath, await realpath(target));
    } catch (error) {
      if (isMissing(error)) return target;
      throw error;
    }
    return target;
  }

  async function removeIfPresent(relativePath: string): Promise<void> {
    const target = await safeExistingPath(relativePath);
    try {
      await unlink(target);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  return {
    async ensureLayout() {
      await mkdir(dataRoot, { recursive: true });
      await Promise.all(
        ['staging', 'originals', 'previews', 'thumbnails'].map((name) =>
          mkdir(resolve(dataRoot, name), { recursive: true })),
      );
    },

    async assertCapacity(requiredBytes) {
      const statistics = await statfs(dataRoot);
      const availableBytes = statistics.bavail * statistics.bsize;
      if (availableBytes - requiredBytes < options.minFreeBytes) {
        throw new MediaStorageError(
          'INSUFFICIENT_STORAGE',
          'The upload would consume the configured free-space reserve',
        );
      }
    },

    async writeStaging(uploadId, source) {
      await this.assertCapacity(options.maxUploadBytes);
      const stagingPath = stagingPathFor(uploadId);
      const target = await ensureSafeParent(stagingPath);
      const hash = createHash('sha256');
      let sizeBytes = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          sizeBytes += chunk.byteLength;
          if (sizeBytes > options.maxUploadBytes) {
            callback(new MediaStorageError('UPLOAD_TOO_LARGE', 'Upload exceeds the byte limit'));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });

      try {
        await pipeline(source, meter, createWriteStream(target, { flags: 'wx' }));
        if (sizeBytes === 0) {
          throw new MediaStorageError('EMPTY_UPLOAD', 'Upload contains no bytes');
        }
        return { stagingPath, sizeBytes, sha256: hash.digest('hex') };
      } catch (error) {
        try {
          await unlink(target);
        } catch (cleanupError) {
          if (!isMissing(cleanupError)) throw cleanupError;
        }
        if (isExisting(error)) {
          throw new MediaStorageError('MEDIA_PATH_EXISTS', 'Staging upload already exists', {
            cause: error,
          });
        }
        throw error;
      }
    },

    async inspectStaged(stagingPath) {
      const detected = await fileTypeFromFile(await safeExistingPath(stagingPath));
      if (detected?.ext === 'jpg') return { extension: 'jpg', mimeType: 'image/jpeg' };
      if (detected?.ext === 'png') return { extension: 'png', mimeType: 'image/png' };
      if (detected?.ext === 'webp') return { extension: 'webp', mimeType: 'image/webp' };
      if (detected?.ext === 'heic' || detected?.ext === 'heif') {
        return { extension: 'heic', mimeType: 'image/heic' };
      }
      throw new MediaStorageError('UNSUPPORTED_IMAGE', 'Unsupported image signature');
    },

    async commitOriginal(input) {
      const source = await safeExistingPath(input.stagingPath);
      const originalPath = createPhotoPaths(input).original;
      const target = await ensureSafeParent(originalPath);
      try {
        await access(target, constants.F_OK);
        throw new MediaStorageError('MEDIA_PATH_EXISTS', 'Original already exists');
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await rename(source, target);
      return originalPath;
    },

    async moveOriginalBack(originalPath, stagingPath) {
      const source = await safeExistingPath(originalPath);
      const target = await ensureSafeParent(stagingPath);
      try {
        await access(target, constants.F_OK);
        throw new MediaStorageError('MEDIA_PATH_EXISTS', 'Staging path already exists');
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await rename(source, target);
    },

    async writeDerivativeAtomically(relativePath, bytes) {
      const target = await ensureSafeParent(relativePath);
      const temporaryPath = `${target}.${randomUUID()}.tmp`;
      const handle = await open(temporaryPath, 'wx');
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await rename(temporaryPath, target);
      } catch (error) {
        try {
          await unlink(temporaryPath);
        } catch (cleanupError) {
          if (!isMissing(cleanupError)) throw cleanupError;
        }
        throw error;
      }
    },

    createReadStream(relativePath) {
      let target: string;
      try {
        target = resolveBelowRoot(dataRoot, relativePath);
      } catch (error) {
        throw new MediaStorageError('INVALID_MEDIA_PATH', 'Invalid media path', { cause: error });
      }
      const rootRealPath = realpathSync(dataRoot);
      const targetRealPath = realpathSync(target);
      assertRealPathBelowRoot(rootRealPath, targetRealPath);
      return createReadStream(targetRealPath);
    },

    removeIfPresent,
  };
}
