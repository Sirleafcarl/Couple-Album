import { describe, expect, it } from 'vitest';
import { buildThreadPath, layoutAlbumAnchors } from '../album-wall/thread-layout.js';

describe('album thread layout', () => {
  it('uses the thread point as the exact start of every album connector', () => {
    const anchors = layoutAlbumAnchors(6, 2_400);

    expect(anchors).toHaveLength(6);
    expect(anchors.map(({ side }) => side)).toEqual([
      'above',
      'below',
      'above',
      'below',
      'above',
      'below',
    ]);
    for (const anchor of anchors) {
      expect(anchor.connectorX).toBe(anchor.x);
      expect(anchor.connectorY).toBe(anchor.threadY);
    }
  });

  it('builds no path for an empty year', () => {
    expect(buildThreadPath([])).toBe('');
  });
});
