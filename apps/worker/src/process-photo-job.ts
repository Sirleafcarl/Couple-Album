import type { ClaimedJob, PhotoProcessingRepository } from '@memory/db';
import {
  createPhotoPaths,
  ImageProcessingError,
  processImage,
  type MediaStorage,
  type ProcessImageInput,
  type ProcessedImage,
  type StoredImageExtension,
} from '@memory/media';

type ProcessingStorage = Pick<
  MediaStorage,
  'createReadStream' | 'writeDerivativeAtomically' | 'removeIfPresent'
>;

type Dependencies = {
  processing: PhotoProcessingRepository;
  storage: ProcessingStorage;
  imageProcessor?: (input: ProcessImageInput) => Promise<ProcessedImage>;
  now?: () => Date;
};

export type ProcessPhotoJobResult =
  | { status: 'completed' }
  | { status: 'retry' | 'failed'; failureCode: string };

function extensionForMime(mimeType: string): StoredImageExtension | null {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  return null;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
    else throw new Error('Original media stream returned a non-byte chunk');
  }
  return Buffer.concat(chunks);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown processing error';
}

export async function processPhotoJob(
  job: ClaimedJob,
  dependencies: Dependencies,
): Promise<ProcessPhotoJobResult> {
  const currentTime = dependencies.now ?? (() => new Date());
  const processor = dependencies.imageProcessor ?? processImage;
  let failureCode = 'PHOTO_LOOKUP_FAILED';
  let derivativePaths: { preview: string; thumbnail: string } | null = null;

  try {
    const photo = await dependencies.processing.findById(job.payload.photoId);
    if (!photo) throw new Error('Processing photo was not found');
    const extension = extensionForMime(photo.mimeType);
    if (!extension) {
      failureCode = 'UNSUPPORTED_IMAGE';
      throw new Error('Stored photo MIME type is unsupported');
    }
    derivativePaths = createPhotoPaths({ ownerId: photo.ownerId, photoId: photo.id, extension });

    failureCode = 'ORIGINAL_READ_FAILED';
    const original = await readStream(dependencies.storage.createReadStream(photo.originalPath));
    failureCode = 'IMAGE_PROCESSING_FAILED';
    const result = await processor({
      bytes: original,
      mimeType: photo.mimeType as ProcessImageInput['mimeType'],
    });

    failureCode = 'DERIVATIVE_WRITE_FAILED';
    await dependencies.storage.writeDerivativeAtomically(derivativePaths.preview, result.preview);
    await dependencies.storage.writeDerivativeAtomically(derivativePaths.thumbnail, result.thumbnail);

    failureCode = 'PROCESSING_COMMIT_FAILED';
    await dependencies.processing.complete({
      jobId: job.id,
      photoId: photo.id,
      previewPath: derivativePaths.preview,
      thumbnailPath: derivativePaths.thumbnail,
      width: result.width,
      height: result.height,
      capturedAt: result.capturedAt,
      sortAt: result.capturedAt ?? photo.createdAt,
      now: currentTime(),
    });
    return { status: 'completed' };
  } catch (error) {
    if (error instanceof ImageProcessingError) failureCode = error.code;
    if (derivativePaths) {
      await Promise.allSettled([
        dependencies.storage.removeIfPresent(derivativePaths.preview),
        dependencies.storage.removeIfPresent(derivativePaths.thumbnail),
      ]);
    }
    const outcome = await dependencies.processing.recordFailure({
      jobId: job.id,
      photoId: job.payload.photoId,
      failureCode,
      error: errorMessage(error),
      now: currentTime(),
    });
    return { status: outcome.status, failureCode };
  }
}
