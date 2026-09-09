import { describe, expect, it } from 'vitest';
import { albumWallThemes } from '../album-wall/album-wall-themes.js';

describe('album wall themes', () => {
  it('retains the classics and registers all eleven approved new themes', () => {
    expect(Object.keys(albumWallThemes)).toEqual(expect.arrayContaining([
      'secret-garden',
      'love-letters',
      'date-adventure',
      'daylight', 'heart-frequency', 'sacred-joy', 'love-playground', 'blue-holiday', 'cloud-candy', 'tropical-cutout', 'clear-specimen', 'photo-exhibition', 'heart-track', 'sky-letters',
    ]));
    expect(Object.keys(albumWallThemes)).toHaveLength(14);
    for (const theme of Object.values(albumWallThemes)) {
      expect(theme.label).not.toBe('');
      expect(theme.className).toMatch(/^album-wall--/);
    }
  });
});
