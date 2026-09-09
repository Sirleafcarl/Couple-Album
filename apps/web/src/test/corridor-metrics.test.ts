import { describe, expect, it } from 'vitest';
import { getCorridorMetrics, advanceCorridor } from '../album-wall/corridor-metrics.js';

describe('corridor sizing and movement', () => {
  it('does not force a long empty track for zero or one album', () => {
    expect(getCorridorMetrics(0, 1100).width).toBe(1100);
    expect(getCorridorMetrics(1, 1100).width).toBe(1100);
  });
  it('keeps every album contained without squeezing a large collection', () => {
    for (const viewport of [390, 834, 1440]) {
      const result = getCorridorMetrics(200, viewport);
      expect(result.width).toBeGreaterThan(viewport);
      expect(result.anchors).toHaveLength(200);
      expect(result.anchors[0]!.x - 116).toBeGreaterThanOrEqual(0);
      expect(result.anchors[199]!.x + 116).toBeLessThanOrEqual(result.width);
      expect(result.anchors[1]!.x - result.anchors[0]!.x).toBe(320);
    }
  });
  it('clamps at the end and never catches up an entire hidden interval', () => {
    expect(advanceCorridor(99, 100, 1000, 12)).toBeLessThanOrEqual(100);
    expect(advanceCorridor(0, 100, 60000, 12)).toBeLessThan(1);
    expect(advanceCorridor(100, 100, 16, 12)).toBe(100);
  });
});
