import { z } from 'zod';
import { PhotoSummarySchema } from './photos.js';

export const AlbumThemeIdSchema = z.enum([
  'secret-garden',
  'love-letters',
  'date-adventure',
  'daylight',
  'heart-frequency',
  'sacred-joy',
  'love-playground',
  'blue-holiday',
  'cloud-candy',
  'tropical-cutout',
  'clear-specimen',
  'photo-exhibition',
  'heart-track',
  'sky-letters',
]);

export const CalendarDateSchema = z.iso.date().refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}, 'Invalid calendar date');

export const AlbumCreatorSchema = z.strictObject({
  id: z.string().uuid(),
  displayName: z.string().min(1),
});

export const AlbumSummarySchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string().min(1).max(80),
  description: z.string().max(500),
  occurredOn: CalendarDateSchema,
  year: z.number().int().min(1000).max(9999),
  month: z.number().int().min(1).max(12),
  coverUrl: z.string().startsWith('/api/photos/').nullable(),
  version: z.number().int().positive(),
  createdBy: AlbumCreatorSchema,
});

export const AlbumYearSchema = z.strictObject({
  year: z.number().int().min(1000).max(9999),
  themeId: AlbumThemeIdSchema,
  themeVersion: z.number().int().positive().nullable(),
  albums: z.array(AlbumSummarySchema),
});

export const AlbumListResponseSchema = z.strictObject({
  years: z.array(AlbumYearSchema),
});

export const CreateAlbumInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  occurredOn: CalendarDateSchema,
});

export const UpdateAlbumInputSchema = z.strictObject({
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  occurredOn: CalendarDateSchema.optional(),
}).refine(
  (value) => value.title !== undefined
    || value.description !== undefined
    || value.occurredOn !== undefined,
  'At least one album field must be updated',
);

export const UpdateAlbumThemeInputSchema = z.strictObject({
  themeId: AlbumThemeIdSchema,
  version: z.number().int().positive().nullable(),
});

export const AlbumThemeSettingSchema = z.strictObject({
  year: z.number().int().min(1000).max(9999),
  themeId: AlbumThemeIdSchema,
  version: z.number().int().positive(),
});

export const AlbumNotFoundResponseSchema = z.strictObject({
  error: z.literal('ALBUM_NOT_FOUND'),
});

export const InvalidAlbumInputResponseSchema = z.strictObject({
  error: z.literal('INVALID_ALBUM_INPUT'),
});

export const AlbumVersionConflictResponseSchema = z.strictObject({
  error: z.literal('ALBUM_VERSION_CONFLICT'),
  current: AlbumSummarySchema,
});

export const InvalidAlbumThemeResponseSchema = z.strictObject({
  error: z.literal('INVALID_ALBUM_THEME'),
});

export const AlbumThemeVersionConflictResponseSchema = z.strictObject({
  error: z.literal('ALBUM_THEME_VERSION_CONFLICT'),
  current: AlbumThemeSettingSchema,
});

export type AlbumThemeId = z.infer<typeof AlbumThemeIdSchema>;
export const AlbumLayoutSchema = z.enum(['story', 'garden', 'film']);
export const AlbumDetailSchema = z.strictObject({
  album: AlbumSummarySchema,
  layout: AlbumLayoutSchema,
  version: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  items: z.array(PhotoSummarySchema),
  nextOffset: z.number().int().nonnegative().nullable(),
});
export const AddAlbumPhotosSchema = z.strictObject({ photoIds: z.array(z.string().uuid()).min(1).max(100) });
export const AlbumWallVersionSchema = z.strictObject({ version: z.number().int().positive() });
export const UpdateAlbumLayoutSchema = AlbumWallVersionSchema.extend({ layout: AlbumLayoutSchema });
export const MoveAlbumPhotoSchema = AlbumWallVersionSchema.extend({ beforePhotoId: z.string().uuid().nullable() });
export type AlbumLayout = z.infer<typeof AlbumLayoutSchema>;
export type AlbumDetail = z.infer<typeof AlbumDetailSchema>;
export type AlbumCreator = z.infer<typeof AlbumCreatorSchema>;
export type AlbumSummary = z.infer<typeof AlbumSummarySchema>;
export type AlbumYear = z.infer<typeof AlbumYearSchema>;
export type AlbumListResponse = z.infer<typeof AlbumListResponseSchema>;
export type CreateAlbumInput = z.infer<typeof CreateAlbumInputSchema>;
export type UpdateAlbumInput = z.infer<typeof UpdateAlbumInputSchema>;
export type UpdateAlbumThemeInput = z.infer<typeof UpdateAlbumThemeInputSchema>;
export type AlbumThemeSetting = z.infer<typeof AlbumThemeSettingSchema>;
export type AlbumVersionConflictResponse = z.infer<typeof AlbumVersionConflictResponseSchema>;
export type AlbumThemeVersionConflictResponse = z.infer<
  typeof AlbumThemeVersionConflictResponseSchema
>;
