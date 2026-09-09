import { describe, expect, it } from 'vitest';
import { columnCountForWidth } from '../components/virtual-photo-grid.js';

describe('responsive virtual photo grid', () => {
  it('uses bounded columns from mobile through desktop widths', () => {
    expect(columnCountForWidth(390)).toBe(1);
    expect(columnCountForWidth(500)).toBe(2);
    expect(columnCountForWidth(700)).toBe(3);
    expect(columnCountForWidth(1200)).toBe(4);
  });
});
