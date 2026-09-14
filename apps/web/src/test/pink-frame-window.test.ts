import { expect, it } from 'vitest';
import { nearbyFrameIndices, pinkGalleryLayout } from '../themes/pink-gallery-layout.js';

it('includes every frame within the processing radius, including alternating layouts and edges', () => {
  for (const count of [0, 1, 9, 300]) {
    const { slots } = pinkGalleryLayout(count);
    for (const x of [-10, 0, 2.3, 46, 450, 1000]) {
      const indices = nearbyFrameIndices(count, x, 18.3);
      for (const slot of slots) if (Math.abs(slot.x - x) <= 18.3) expect(indices).toContain(slot.index);
      expect(indices.every(index => index >= 0 && index < count)).toBe(true);
      expect(new Set(indices).size).toBe(indices.length);
    }
  }
});

it('bounds nearby work independently of album count and does not omit the final album', () => {
  expect(nearbyFrameIndices(300, 200, 18.3).length).toBeLessThanOrEqual(30);
  expect(nearbyFrameIndices(3000, 200, 18.3)).toEqual(nearbyFrameIndices(300, 200, 18.3));
  const last = pinkGalleryLayout(300).slots.at(-1)!;
  expect(nearbyFrameIndices(300, last.x, 18.3)).toContain(last.index);
});
