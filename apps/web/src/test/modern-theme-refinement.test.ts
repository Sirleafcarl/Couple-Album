import { describe, it, expect } from 'vitest';
import { modernCorridorLayout } from '../album-wall/modern-corridor-layout.js';

describe('compact modern album geometry', () => {
  it('fits five sacred frames in a 1000px gallery and two on a phone', () => {
    for (const [viewport, visibleCount, maxWidth] of [[1000, 5, 156], [390, 2, 124]]) {
      const result = modernCorridorLayout(9, viewport!, 500, 'orbit');
      expect(result.cards[0]!.width).toBeLessThanOrEqual(maxWidth!);
      const last = result.cards[visibleCount! - 1]!;
      expect(last.x + last.width / 2 + 16).toBeLessThanOrEqual(viewport!);
      expect(result.cards[0]!.height - result.cards[0]!.imageHeight).toBe(52);
    }
  });
  it('caps cards on desktop and phone rather than filling the scene', () => {
    expect(modernCorridorLayout(8, 1400, 680, 'collage').cards[0]!.width).toBeLessThanOrEqual(210);
    expect(modernCorridorLayout(8, 390, 680, 'collage').cards[0]!.width).toBeLessThanOrEqual(150);
  });
  it('connects alternating top and bottom edges without clipping actual card bounds', () => {
    for (const height of [360, 500, 680]) {
      const { cards } = modernCorridorLayout(200, 390, height, 'hanging');
      cards.forEach((card, i) => {
        expect(card.side).toBe(i % 2 ? 'below' : 'above');
        expect(card.connectorY).toBe(card.side === 'above' ? card.y + card.height : card.y);
        expect(Math.abs(card.threadY - card.connectorY)).toBeCloseTo(24);
        expect(card.y).toBeGreaterThanOrEqual(16);
        expect(card.y + card.height).toBeLessThanOrEqual(height - 16);
      });
    }
  });
});
