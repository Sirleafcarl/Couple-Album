import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const styles = readFileSync(resolve(process.cwd(), 'src/themes/pink-room.css'), 'utf8');

describe('pink room focus presentation', () => {
  it('does not expand the backup album panel when dialog focus is restored', () => {
    expect(styles).not.toContain('.pink-room__albums:focus-within');
    expect(styles).toContain('.pink-room__albums--fallback');
  });
});
