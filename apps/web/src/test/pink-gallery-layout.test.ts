import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import { galleryCameraBounds, pinkGalleryLayout } from '../themes/pink-gallery-layout.js';
import { fitAlbumTexture } from '../themes/pink-gallery-textures.js';

describe('continuous gallery coordinates and image fitting', () => {
  it.each([0, 1, 9, 200])('gives every one of %i albums a continuous position', count => {
    const layout = pinkGalleryLayout(count);
    expect(layout.slots).toHaveLength(count);
    expect(layout.bays).toBe(Math.max(3, Math.ceil(count / 3)));
    expect(new Set(layout.slots.map(slot => `${slot.x}/${slot.y}`)).size).toBe(count);
  });
  it('lets a narrow screen travel from first to final bay instead of shrinking all frames', () => {
    const mobile = galleryCameraBounds(200, .5), desktop = galleryCameraBounds(9, 1.8);
    expect(mobile.first).toBe(0);
    expect(mobile.last).toBeGreaterThan(300);
    expect(mobile.visibleWidth).toBeLessThan(5);
    expect(desktop.last - desktop.first).toBeLessThan(1);
  });
  it('center crops either orientation without stretching', () => {
    const texture = new Texture();
    fitAlbumTexture(texture, 1, 2000, 1000);
    expect(texture.repeat.x).toBe(.5); expect(texture.offset.x).toBe(.25);
    fitAlbumTexture(texture, 2, 1000, 2000);
    expect(texture.repeat.x).toBe(1); expect(texture.repeat.y).toBe(.25); expect(texture.offset.y).toBe(.375);
  });
});
