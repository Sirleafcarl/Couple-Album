import { z } from 'zod';

export const PhotoStatusSchema = z.enum(['processing', 'ready', 'failed']);
export const UploadStatusSchema = z.enum(['receiving', 'committed', 'duplicate', 'failed']);

const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const PhotoCursorValueSchema = z.strictObject({
  sortAt: IsoDateTimeSchema,
  id: z.string().uuid(),
});

export type PhotoCursorValue = z.infer<typeof PhotoCursorValueSchema>;

export function encodePhotoCursor(value: PhotoCursorValue): string {
  return Buffer.from(JSON.stringify(PhotoCursorValueSchema.parse(value)), 'utf8').toString('base64url');
}

export function decodePhotoCursor(cursor: string): PhotoCursorValue {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return PhotoCursorValueSchema.parse(decoded);
  } catch {
    throw new Error('Invalid photo cursor');
  }
}

export const PhotoListQuerySchema = z.strictObject({
  owner: z.union([z.literal('all'), z.literal('me'), z.literal('partner'), z.string().uuid()]).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().min(1).optional(),
});

export const PhotoSummarySchema = z.strictObject({
  id: z.string().uuid(),
  owner: z.strictObject({
    id: z.string().uuid(),
    displayName: z.string().min(1),
  }),
  originalFilename: z.string().min(1),
  status: PhotoStatusSchema,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  capturedAt: IsoDateTimeSchema.nullable(),
  sortAt: IsoDateTimeSchema,
  failureCode: z.string().min(1).nullable(),
  media: z.strictObject({
    original: z.string().startsWith('/api/photos/'),
    preview: z.string().startsWith('/api/photos/').nullable(),
    thumbnail: z.string().startsWith('/api/photos/').nullable(),
  }),
});

export const PhotoListResponseSchema = z.strictObject({
  items: z.array(PhotoSummarySchema),
  nextCursor: z.string().nullable(),
});

export const UploadSummarySchema = z.strictObject({
  id: z.string().uuid(),
  originalFilename: z.string().min(1),
  status: UploadStatusSchema,
  bytesReceived: z.number().int().nonnegative(),
  errorCode: z.string().min(1).nullable(),
  photoId: z.string().uuid().nullable(),
  createdAt: IsoDateTimeSchema,
});

export const DuplicatePhotoResponseSchema = z.strictObject({
  error: z.literal('DUPLICATE_PHOTO'),
  existingPhotoId: z.string().uuid(),
  upload: UploadSummarySchema.optional(),
});

export type PhotoStatus = z.infer<typeof PhotoStatusSchema>;
export type UploadStatus = z.infer<typeof UploadStatusSchema>;
export type PhotoListQuery = z.infer<typeof PhotoListQuerySchema>;
export type PhotoSummary = z.infer<typeof PhotoSummarySchema>;
export type PhotoListResponse = z.infer<typeof PhotoListResponseSchema>;
export type UploadSummary = z.infer<typeof UploadSummarySchema>;
export type DuplicatePhotoResponse = z.infer<typeof DuplicatePhotoResponseSchema>;
