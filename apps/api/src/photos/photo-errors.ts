import { MediaStorageError } from '@memory/media';

export type PhotoUploadErrorCode =
  | 'EMPTY_UPLOAD'
  | 'UPLOAD_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE'
  | 'DUPLICATE_PHOTO'
  | 'INSUFFICIENT_STORAGE'
  | 'MALFORMED_MULTIPART'
  | 'MULTIPART_LIMIT'
  | 'UPLOAD_UNAVAILABLE';

export class PhotoUploadError extends Error {
  readonly existingPhotoId?: string;

  constructor(
    readonly code: PhotoUploadErrorCode,
    readonly statusCode: number,
    message: string,
    options: ErrorOptions & { existingPhotoId?: string } = {},
  ) {
    super(message, options);
    this.name = 'PhotoUploadError';
    if (options.existingPhotoId) this.existingPhotoId = options.existingPhotoId;
  }
}

export function toPhotoUploadError(error: unknown): PhotoUploadError {
  if (error instanceof PhotoUploadError) return error;
  const errorCode = error instanceof Error && 'code' in error ? error.code : null;
  if (errorCode === 'FST_REQ_FILE_TOO_LARGE') {
    return new PhotoUploadError('UPLOAD_TOO_LARGE', 413, 'Upload exceeds the byte limit', {
      cause: error,
    });
  }
  if (errorCode === 'FST_FILES_LIMIT' || errorCode === 'FST_FIELDS_LIMIT' || errorCode === 'FST_PARTS_LIMIT') {
    return new PhotoUploadError('MULTIPART_LIMIT', 400, 'Multipart upload has too many parts', {
      cause: error,
    });
  }
  if (
    errorCode === 'FST_INVALID_MULTIPART_CONTENT_TYPE'
    || errorCode === 'FST_MP_PREMATURE_CLOSE'
    || errorCode === 'ERR_STREAM_PREMATURE_CLOSE'
  ) {
    return new PhotoUploadError('MALFORMED_MULTIPART', 400, 'Malformed multipart upload', {
      cause: error,
    });
  }
  if (error instanceof MediaStorageError) {
    if (error.code === 'EMPTY_UPLOAD') {
      return new PhotoUploadError('EMPTY_UPLOAD', 400, error.message, { cause: error });
    }
    if (error.code === 'UPLOAD_TOO_LARGE') {
      return new PhotoUploadError('UPLOAD_TOO_LARGE', 413, error.message, { cause: error });
    }
    if (error.code === 'UNSUPPORTED_IMAGE') {
      return new PhotoUploadError('UNSUPPORTED_IMAGE', 415, error.message, { cause: error });
    }
    if (error.code === 'INSUFFICIENT_STORAGE') {
      return new PhotoUploadError('INSUFFICIENT_STORAGE', 507, error.message, { cause: error });
    }
  }
  return new PhotoUploadError('UPLOAD_UNAVAILABLE', 503, 'Photo upload is temporarily unavailable', {
    cause: error,
  });
}
