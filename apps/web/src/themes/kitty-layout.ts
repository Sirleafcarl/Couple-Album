import type { KittyTheme } from './room-theme.js';

export function kittyLayout(count: number, viewportWidth: number, height: number, theme: KittyTheme) {
  if (theme === 'kitty-dream') {
    // The photos and captions use the same coordinate system as their cabinet.
    // Measured from cabinet-v3: two continuous shelves, four recessed openings.
    const size = Math.min(680, height);
    const bayCount = Math.ceil(count / 4);
    const inset = Math.max(24, (viewportWidth - bayCount * size) / 2);
    const bays = Array.from({ length: bayCount }, (_, index) => ({ x: inset + index * size, y: 0, width: size, height: size }));
    const cards = Array.from({ length: count }, (_, index) => {
      const bay = bays[Math.floor(index / 4)]!;
      const slot = index % 4;
      return { x: bay.x + size * (slot < 2 ? .153 : .57), y: size * (slot % 2 ? .53 : .128), width: size * .274, height: size * .276, depth: slot % 2 };
    });
    return { width: Math.max(viewportWidth, 48 + bayCount * size), bays, cards };
  }
  // Both photo windows share the island's floor, plinths and camera projection.
  // Measured from island-v3.webp (1536 × 1024), not independent card offsets.
  const islandHeight = Math.min(680, height);
  const islandWidth = islandHeight * 1.5;
  const bayCount = Math.ceil(count / 2);
  const inset = Math.max(0, (viewportWidth - bayCount * islandWidth) / 2);
  const bays = Array.from({ length: bayCount }, (_, index) => ({ x: inset + index * islandWidth, y: 0, width: islandWidth, height: islandHeight }));
  const cards = Array.from({ length: count }, (_, index) => {
    const bay = bays[Math.floor(index / 2)]!;
    const rear = index % 2 === 1;
    const photoWidth = rear ? .102 : .258;
    const photoLeft = rear ? .704 : .3255;
    const mirrored = Math.floor(index / 2) % 2 === 1;
    return { x: bay.x + islandWidth * (mirrored ? 1 - photoLeft - photoWidth : photoLeft), y: islandHeight * (rear ? .27 : .187), width: islandWidth * photoWidth, height: islandHeight * (rear ? .25 : .5), depth: index % 2 };
  });
  return { width: Math.max(viewportWidth, bayCount * islandWidth), bays, cards };
}
