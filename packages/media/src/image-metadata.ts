import exifr from 'exifr';

type ExifDateFields = {
  DateTimeOriginal?: unknown;
  OffsetTimeOriginal?: unknown;
};

function parseOffsetMinutes(offset: string): number | undefined {
  if (offset === 'Z') return 0;
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return undefined;

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return undefined;
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

export function parseExifDateTime(value: unknown, offsetValue?: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  if (
    year === undefined || month === undefined || day === undefined || hour === undefined
    || minute === undefined || second === undefined
  ) return null;

  const offsetMinutes = typeof offsetValue === 'string'
    ? parseOffsetMinutes(offsetValue)
    : 0;
  if (offsetMinutes === undefined) return null;

  const wallClock = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    wallClock.getUTCFullYear() !== year
    || wallClock.getUTCMonth() !== month - 1
    || wallClock.getUTCDate() !== day
    || wallClock.getUTCHours() !== hour
    || wallClock.getUTCMinutes() !== minute
    || wallClock.getUTCSeconds() !== second
  ) return null;

  return new Date(wallClock.getTime() - offsetMinutes * 60_000);
}

export async function extractCapturedAt(bytes: Uint8Array): Promise<Date | null> {
  try {
    const fields = await exifr.parse(bytes, {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal'],
      reviveValues: false,
    }) as ExifDateFields | undefined;
    return parseExifDateTime(fields?.DateTimeOriginal, fields?.OffsetTimeOriginal);
  } catch {
    return null;
  }
}
