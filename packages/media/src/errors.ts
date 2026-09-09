export type MediaStorageErrorCode =
  | 'EMPTY_UPLOAD'
  | 'UPLOAD_TOO_LARGE'
  | 'INSUFFICIENT_STORAGE'
  | 'UNSUPPORTED_IMAGE'
  | 'INVALID_MEDIA_PATH'
  | 'MEDIA_PATH_EXISTS';

export class MediaStorageError extends Error {
  constructor(
    readonly code: MediaStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MediaStorageError';
  }
}
