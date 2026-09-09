import type { AlbumAnchor } from './thread-layout.js';

export function getCorridorMetrics(count: number, viewportWidth: number) {
  const inset = 160;
  const stride = 320;
  const width = Math.max(viewportWidth, count ? inset * 2 + (count - 1) * stride : 0);
  const anchors: AlbumAnchor[] = Array.from({ length: count }, (_, index) => {
    const x = inset + index * stride;
    const threadY = 310 + Math.sin(index * 1.35) * 30;
    return { x, threadY, connectorX: x, connectorY: threadY, side: index % 2 ? 'below' : 'above' };
  });
  return { width, anchors };
}

export function advanceCorridor(left: number, max: number, elapsed: number, speed: number) {
  return Math.min(max, left + Math.max(0, Math.min(elapsed, 64)) / 1000 * speed);
}
