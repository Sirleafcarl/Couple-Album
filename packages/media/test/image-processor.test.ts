import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseExifDateTime } from '../src/image-metadata.js';
import { processImage } from '../src/image-processor.js';

const fixtures = join(import.meta.dirname, 'fixtures');

async function metadata(bytes: Uint8Array) {
  return sharp(bytes).metadata();
}

describe('processImage', () => {
  it('extracts capture time and creates bounded WebP derivatives for JPEG', async () => {
    const result = await processImage({
      bytes: await readFile(join(fixtures, 'landscape.jpg')),
      mimeType: 'image/jpeg',
    });

    expect(result).toMatchObject({
      width: 1200,
      height: 800,
      capturedAt: new Date('2026-08-01T08:00:00.000Z'),
    });
    await expect(metadata(result.preview)).resolves.toMatchObject({
      format: 'webp',
      width: 1200,
      height: 800,
    });
    await expect(metadata(result.thumbnail)).resolves.toMatchObject({
      format: 'webp',
      width: 480,
      height: 320,
    });
  });

  it.each([
    { filename: 'portrait.png', mimeType: 'image/png', width: 600, height: 900 },
    { filename: 'sample.webp', mimeType: 'image/webp', width: 320, height: 200 },
    { filename: 'sample.heic', mimeType: 'image/heic', width: 600, height: 900 },
  ] as const)('processes $mimeType input', async ({ filename, mimeType, width, height }) => {
    const result = await processImage({
      bytes: await readFile(join(fixtures, filename)),
      mimeType,
    });
    const thumbnailScale = Math.min(1, 480 / Math.max(width, height));

    expect(result).toMatchObject({ width, height });
    expect(await metadata(result.preview)).toMatchObject({ format: 'webp', width, height });
    expect(await metadata(result.thumbnail)).toMatchObject({
      format: 'webp',
      width: Math.round(width * thumbnailScale),
      height: Math.round(height * thumbnailScale),
    });
  });

  it('normalizes EXIF orientation before reporting dimensions', async () => {
    const result = await processImage({
      bytes: await readFile(join(fixtures, 'oriented-6.jpg')),
      mimeType: 'image/jpeg',
    });

    expect(result).toMatchObject({ width: 80, height: 120 });
    expect(await metadata(result.preview)).toMatchObject({ width: 80, height: 120 });
  });

  it('rejects corrupt image bytes with a stable code', async () => {
    await expect(processImage({
      bytes: await readFile(join(fixtures, 'corrupt.jpg')),
      mimeType: 'image/jpeg',
    })).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  it('rejects images above the 100-million-pixel safety limit', async () => {
    const oversizedSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10001" height="10001"></svg>',
    );

    await expect(processImage({
      bytes: oversizedSvg,
      mimeType: 'image/jpeg',
    })).rejects.toMatchObject({ code: 'IMAGE_PIXEL_LIMIT' });
  });
});

describe('parseExifDateTime', () => {
  it('applies the recorded timezone offset', () => {
    expect(parseExifDateTime('2026:08:01 08:00:00', '+08:00'))
      .toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it.each([
    '2026:02:30 08:00:00',
    '2026:13:01 08:00:00',
    '2026:08:01 25:00:00',
    'not a date',
  ])('rejects impossible EXIF date %s', (value) => {
    expect(parseExifDateTime(value)).toBeNull();
  });
});
