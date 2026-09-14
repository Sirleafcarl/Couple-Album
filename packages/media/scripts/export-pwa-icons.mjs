// Build-time image resizing only; the approved artwork is not regenerated.
// Run from any directory: node packages/media/scripts/export-pwa-icons.mjs
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = fileURLToPath(new URL('../../../docs/assets/mobile-pwa/cream-garden-icon-master.png', import.meta.url));
const output = new URL('../../../apps/web/public/icons/', import.meta.url);
await mkdir(output, { recursive: true });
const cream = '#f7f1ea';
for (const [name, size] of [
  ['icon-192.png', 192], ['icon-512.png', 512],
  ['apple-touch-icon.png', 180], ['favicon-32.png', 32],
]) {
  await sharp(source).flatten({ background: cream }).resize(size, size, { fit: 'contain', background: cream })
    .png().toFile(fileURLToPath(new URL(name, output)));
}
// Extra padding keeps the frame inside the central maskable safe area.
await sharp(source).flatten({ background: cream }).resize(400, 400, { fit: 'contain', background: cream })
  .extend({ top: 56, bottom: 56, left: 56, right: 56, extendWith: 'copy' })
  .png().toFile(fileURLToPath(new URL('icon-maskable-512.png', output)));
