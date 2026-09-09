export interface RelationshipDuration {
  totalDays: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function getRelationshipDuration(startedAt: Date, now: Date): RelationshipDuration {
  const elapsed = Math.max(0, now.getTime() - startedAt.getTime());
  return {
    totalDays: Math.floor(elapsed / DAY),
    hours: Math.floor((elapsed % DAY) / HOUR),
    minutes: Math.floor((elapsed % HOUR) / MINUTE),
    seconds: Math.floor((elapsed % MINUTE) / SECOND),
  };
}
