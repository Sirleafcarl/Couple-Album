import { describe, expect, it } from 'vitest';
import { kittyLayout } from '../themes/kitty-layout.js';

describe('Kitty scene geometry', () => {
  it('centers a short pink collection instead of leaving half the room empty', () => {
    const layout = kittyLayout(6, 1700, 680, 'kitty-dream');
    const first = layout.bays[0]!;
    const last = layout.bays.at(-1)!;
    expect(first.x).toBeCloseTo(1700 - last.x - last.width);
  });
  it('shares one continuous cabinet between every four pink albums', () => {
    expect(kittyLayout(200, 1200, 680, 'kitty-dream').bays).toHaveLength(50);
    expect(kittyLayout(0, 1200, 680, 'kitty-dream').bays).toHaveLength(0);
  });
  it('stages gallery displays on visibly separate foreground and background planes', () => {
    const { cards } = kittyLayout(6, 1400, 680, 'kitty-gallery');
    expect(cards[0]!.y + cards[0]!.height).toBeGreaterThan(cards[1]!.y + cards[1]!.height);
    expect(cards[0]!.height / cards[1]!.height).toBeGreaterThan(1.3);
  });
  it('anchors two gallery albums to one shared island and floor', () => {
    const result = kittyLayout(6, 1400, 680, 'kitty-gallery');
    expect(result.bays).toHaveLength(3);
    expect(result.cards[0]!.x).toBeCloseTo(result.bays[0]!.x + result.bays[0]!.width * .3255);
    expect(result.cards[1]!.x).toBeCloseTo(result.bays[0]!.x + result.bays[0]!.width * .704);
  });
  it('mirrors alternating islands and their photo coordinates together', () => {
    const result = kittyLayout(4, 1400, 680, 'kitty-gallery');
    const second = result.bays[1]!;
    expect(result.cards[2]!.x).toBeCloseTo(second.x + second.width * (1 - .3255 - .258));
  });
  it('uses paired display niches versus individually receding exhibition blocks', () => {
    const pink = kittyLayout(6, 1200, 680, 'kitty-dream');
    expect(pink.cards[0]!.x).toBe(pink.cards[1]!.x);
    expect(pink.cards[0]!.y + pink.cards[0]!.height).toBeLessThan(pink.cards[1]!.y);
    const gallery = kittyLayout(6, 1200, 680, 'kitty-gallery');
    expect(gallery.cards[0]!.x).toBeLessThan(gallery.cards[1]!.x);
    expect(gallery.cards[0]!.height).toBeGreaterThan(gallery.cards[1]!.height);
  });
  it('fits every card and caption at phone, tablet and desktop sizes for200albums', () => {
    for (const theme of ['kitty-dream', 'kitty-gallery'] as const) for (const height of [360, 500, 680]) for (const width of [390, 820, 1440]) for (const count of [0, 1, 200]) {
      const result = kittyLayout(count, width, height, theme);
      expect(result.width).toBeGreaterThanOrEqual(width);
      for (const card of result.cards) {
        expect(card.y).toBeGreaterThanOrEqual(0);
        expect(card.y + card.height).toBeLessThanOrEqual(height);
        expect(card.x + card.width).toBeLessThanOrEqual(result.width);
      }
    }
  });
});
