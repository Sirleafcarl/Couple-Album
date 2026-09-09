import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));

function colorGrid(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  const colors = [
    [220, 40, 60],
    [30, 150, 80],
    [40, 90, 210],
    [240, 190, 40],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const quadrant = (y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0);
      const offset = (y * width + x) * 3;
      const color = colors[quadrant];
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
  return { pixels, raw: { width, height, channels: 3 } };
}

const landscape = colorGrid(1200, 800);
await sharp(landscape.pixels, { raw: landscape.raw })
  .withExif({
    IFD2: {
      DateTimeOriginal: '2026:08:01 08:00:00',
      OffsetTimeOriginal: '+00:00',
    },
  })
  .jpeg({ quality: 90 })
  .toFile(join(fixtureDirectory, 'landscape.jpg'));

const portrait = colorGrid(600, 900);
await sharp(portrait.pixels, { raw: portrait.raw })
  .png()
  .toFile(join(fixtureDirectory, 'portrait.png'));

const webp = colorGrid(320, 200);
await sharp(webp.pixels, { raw: webp.raw })
  .webp({ quality: 90 })
  .toFile(join(fixtureDirectory, 'sample.webp'));

const oriented = colorGrid(120, 80);
await sharp(oriented.pixels, { raw: oriented.raw })
  .withMetadata({ orientation: 6 })
  .jpeg({ quality: 90 })
  .toFile(join(fixtureDirectory, 'oriented-6.jpg'));

await writeFile(join(fixtureDirectory, 'corrupt.jpg'), Buffer.from('not a jpeg'));
