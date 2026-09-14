import type { AlbumWallTheme } from './album-wall-types.js';

export function modernCorridorLayout(count: number, viewportWidth: number, height: number, layout: AlbumWallTheme['layout']) {
  const sacred = layout === 'orbit';
  const cardWidth = sacred ? Math.min(viewportWidth < 700 ? 124 : 156, height * .32) : Math.min(viewportWidth < 700 ? 150 : 210, height * .36);
  const stride = cardWidth + (sacred ? 42 : 64);
  const inset = cardWidth / 2 + (sacred ? 24 : 30);
  const cards = Array.from({ length: count }, (_, index) => {
    const phase = index % 5;
    const width = cardWidth;
    const ratio = sacred ? 1.08 : layout === 'collage' && index % 3 === 2 ? 1 : 1.16;
    const imageHeight = Math.round(width * ratio);
    const cardHeight = imageHeight + (sacred ? 52 : 64);
    const available = Math.max(0, height - cardHeight - 48);
    const side = index % 2 ? 'below' as const : 'above' as const;
    let y = available * .45;
    if (layout === 'collage' || layout === 'hanging') y = available * (side === 'above' ? .08 : .92);
    if (layout === 'arc') y = available * (.12 + Math.abs(phase - 2) * .32);
    if (layout === 'orbit') y = available * (.4 + Math.sin(index * 1.3) * .25);
    y += 24;
    const connectorY = side === 'above' ? y + cardHeight : y;
    return { x: inset + index * stride, y, width, height: cardHeight, imageHeight, side, connectorY,
      threadY: connectorY + (side === 'above' ? 24 : -24),
      angle: layout === 'arc' ? (phase - 2) * 3 : 0 };
  });
  return { width: Math.max(viewportWidth, count ? inset * 2 + (count - 1) * stride : 0), cards };
}
