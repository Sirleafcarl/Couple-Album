import { describe, expect, it } from 'vitest';
import { pinkRenderPixelRatio } from '../themes/pink-render-resolution.js';

describe('pink gallery rendering resolution', () => {
  it('renders a Retina desktop at its native density', () => {
    expect(pinkRenderPixelRatio(1440, 800, 2)).toBe(2);
  });
  it('keeps small high-density phone canvases sharp', () => {
    expect(pinkRenderPixelRatio(390, 680, 3)).toBe(3);
  });
  it('does not supersample standard-density screens', () => {
    expect(pinkRenderPixelRatio(1440, 800, 1)).toBe(1);
  });
  it('caps density and the total drawing-buffer pixel count', () => {
    expect(pinkRenderPixelRatio(390, 680, 4)).toBe(3);
    const ratio = pinkRenderPixelRatio(3840, 2160, 2);
    expect(ratio).toBeLessThan(2);
    expect(Math.floor(3840 * ratio) * Math.floor(2160 * ratio)).toBeLessThanOrEqual(8_000_000);
  });
  it('recomputes density for a resized canvas or changed display', () => {
    expect(pinkRenderPixelRatio(1440, 800, 2)).toBeGreaterThan(pinkRenderPixelRatio(3000, 2000, 2));
    expect(pinkRenderPixelRatio(1440, 800, 2)).toBeGreaterThan(pinkRenderPixelRatio(1440, 800, 1));
  });
});
