import type { AlbumWallTheme } from './album-wall-types.js';

export function modernCorridorLayout(count: number, viewportWidth: number, height: number, layout: AlbumWallTheme['layout']) {
  const cardWidth = Math.max(155, Math.min(270, height * .48));
  const stride = cardWidth + (layout === 'editorial' ? 64 : 38);
  const inset = cardWidth / 2 + 30;
  const available = Math.max(0, height - cardWidth * 1.32 - 76);
  const cards = Array.from({ length: count }, (_, index) => {
    const phase = index % 5;
    let y = available * .45;
    if (layout === 'editorial' || layout === 'collage' || layout === 'pop') y = available * ([.12, .62, .28, .82, .35][phase]!);
    if (layout === 'arc') y = available * (.12 + Math.abs(phase - 2) * .32);
    if (layout === 'orbit') y = available * (.4 + Math.sin(index * 1.3) * .25);
    if (layout === 'track') y = available * (.65 - (index % 4) * .16);
    if (layout === 'hanging') y = available * (.3 + Math.sin(index * 1.3) * .15);
    return { x: inset + index * stride, y: y + 24, width: layout === 'track' ? cardWidth * (1 - (index % 4) * .08) : cardWidth, angle: layout === 'arc' ? (phase - 2) * 4 : layout === 'pop' ? (index % 2 ? 3 : -3) : 0 };
  });
  return { width: Math.max(viewportWidth, count ? inset * 2 + (count - 1) * stride : 0), cards };
}
