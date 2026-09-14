import { describe, expect, it } from 'vitest';
import { albumWallThemes } from '../album-wall/album-wall-themes.js';
import { AlbumThemeIdSchema } from '@memory/contracts/albums';

describe('album wall themes', () => {
  it('retains the classics and registers the modern and Kitty themes', () => {
    expect(Object.keys(albumWallThemes)).toEqual(expect.arrayContaining([
      'secret-garden',
      'love-letters',
      'sacred-joy', 'cloud-candy', 'clear-specimen', 'sky-letters', 'kitty-dream', 'kitty-gallery',
    ]));
    expect(Object.keys(albumWallThemes)).toHaveLength(8);
    for (const theme of Object.values(albumWallThemes)) {
      expect(theme.label).not.toBe('');
      expect(theme.className).toMatch(/^album-wall--/);
    }
  });
  it.each(['fairytale-castle', 'daylight', 'heart-frequency', 'photo-exhibition', 'heart-track', 'love-playground', 'blue-holiday', 'tropical-cutout', 'date-adventure'])('removes %s from the picker and new theme settings', (id) => {
    expect(albumWallThemes).not.toHaveProperty(id);
    expect(AlbumThemeIdSchema.safeParse(id).success).toBe(false);
  });
});
