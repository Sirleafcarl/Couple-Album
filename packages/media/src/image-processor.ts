import sharp, { type Sharp } from 'sharp';
import { decodeHeic } from './heic-decoder.js';
import { extractCapturedAt } from './image-metadata.js';

const MAX_INPUT_PIXELS = 100_000_000;

export type ImageProcessingErrorCode = 'INVALID_IMAGE' | 'IMAGE_PIXEL_LIMIT';

export class ImageProcessingError extends Error {
  constructor(
    readonly code: ImageProcessingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ImageProcessingError';
  }
}

export type ProcessImageInput = {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
};

export type ProcessedImage = {
  width: number;
  height: number;
  capturedAt: Date | null;
  preview: Buffer;
  thumbnail: Buffer;
};

function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel limit|exceeds.*pixels?/i.test(error.message);
}

async function createPipeline(input: ProcessImageInput): Promise<Sharp> {
  if (input.mimeType !== 'image/heic') {
    return sharp(input.bytes, { limitInputPixels: MAX_INPUT_PIXELS });
  }

  const decoded = await decodeHeic(input.bytes);
  if (
    !Number.isSafeInteger(decoded.width)
    || !Number.isSafeInteger(decoded.height)
    || decoded.width <= 0
    || decoded.height <= 0
  ) {
    throw new ImageProcessingError('INVALID_IMAGE', 'Decoded HEIC dimensions are invalid');
  }
  const pixelCount = decoded.width * decoded.height;
  if (pixelCount > MAX_INPUT_PIXELS) {
    throw new ImageProcessingError('IMAGE_PIXEL_LIMIT', 'Image exceeds the pixel safety limit');
  }
  if (decoded.data.byteLength !== pixelCount * 4) {
    throw new ImageProcessingError('INVALID_IMAGE', 'Decoded HEIC pixel data is incomplete');
  }
  return sharp(decoded.data, {
    raw: { width: decoded.width, height: decoded.height, channels: 4 },
    limitInputPixels: MAX_INPUT_PIXELS,
  });
}

export async function processImage(input: ProcessImageInput): Promise<ProcessedImage> {
  try {
    const pipeline = await createPipeline(input);
    const metadata = await pipeline.metadata();
    if (metadata.width === undefined || metadata.height === undefined) {
      throw new ImageProcessingError('INVALID_IMAGE', 'Image dimensions are unavailable');
    }
    const dimensions = metadata.autoOrient ?? {
      width: metadata.width,
      height: metadata.height,
    };

    const [capturedAt, preview, thumbnail] = await Promise.all([
      extractCapturedAt(input.bytes),
      pipeline.clone().autoOrient().resize({
        width: 2560,
        height: 2560,
        fit: 'inside',
        withoutEnlargement: true,
      }).webp({ quality: 82 }).toBuffer(),
      pipeline.clone().autoOrient().resize({
        width: 480,
        height: 480,
        fit: 'inside',
        withoutEnlargement: true,
      }).webp({ quality: 75 }).toBuffer(),
    ]);

    return { ...dimensions, capturedAt, preview, thumbnail };
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    if (isPixelLimitError(error)) {
      throw new ImageProcessingError('IMAGE_PIXEL_LIMIT', 'Image exceeds the pixel safety limit', {
        cause: error,
      });
    }
    throw new ImageProcessingError('INVALID_IMAGE', 'Image bytes could not be decoded', {
      cause: error,
    });
  }
}
