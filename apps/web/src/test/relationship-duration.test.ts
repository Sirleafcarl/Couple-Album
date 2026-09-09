import { describe, expect, it } from 'vitest';
import { getRelationshipDuration } from '../album-wall/relationship-duration.js';

describe('relationship duration', () => {
  it('splits elapsed time into total days and clock units', () => {
    expect(
      getRelationshipDuration(
        new Date('2026-09-01T00:00:00+08:00'),
        new Date('2026-09-03T01:02:03+08:00'),
      ),
    ).toEqual({ totalDays: 2, hours: 1, minutes: 2, seconds: 3 });
  });

  it('clamps a future start time to zero', () => {
    expect(
      getRelationshipDuration(
        new Date('2026-09-04T00:00:00+08:00'),
        new Date('2026-09-03T00:00:00+08:00'),
      ),
    ).toEqual({ totalDays: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
