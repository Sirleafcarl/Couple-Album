import { describe, expect, it } from 'vitest';
import { modernCorridorLayout } from '../album-wall/modern-corridor-layout.js';
import { albumWallThemes } from '../album-wall/album-wall-themes.js';
import { AlbumThemeIdSchema } from '@memory/contracts/albums';

describe('modern theme geometry and contracts', () => {
  it('accepts every selectable theme on the shared API contract', () => {
    for (const theme of Object.values(albumWallThemes)) expect(AlbumThemeIdSchema.safeParse(theme.id).success).toBe(true);
    expect(AlbumThemeIdSchema.safeParse('rainy-night').success).toBe(false);
  });
  it('fits zero, one and two hundred covers without overlap or vertical overflow', () => {
    for (const theme of Object.values(albumWallThemes).filter(theme => theme.modern)) {
      for (const height of [360, 500, 680]) {
        for (const count of [0, 1, 200]) {
          const result = modernCorridorLayout(count, 390, height, theme.layout);
          expect(result.width).toBeGreaterThanOrEqual(390);
          result.cards.forEach((card, index) => {
            expect(card.x - card.width / 2).toBeGreaterThanOrEqual(0);
            expect(card.x + card.width / 2).toBeLessThanOrEqual(result.width);
            expect(card.y + card.width * 1.25 + 65).toBeLessThanOrEqual(height);
            if (index) expect(card.x - result.cards[index - 1]!.x).toBeGreaterThan(card.width);
          });
        }
      }
    }
  });
});
