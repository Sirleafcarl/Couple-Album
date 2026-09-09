import type { PhotoListItem, UploadHistoryItem } from '@memory/db';
import type { PhotoSummary, UploadSummary } from '@memory/contracts/photos';

export function presentPhoto(photo: PhotoListItem): PhotoSummary {
  const base = `/api/photos/${photo.id}/media`;
  const derivativesReady = photo.status === 'ready';
  return {
    id: photo.id,
    owner: { id: photo.ownerId, displayName: photo.ownerDisplayName },
    originalFilename: photo.originalFilename,
    status: photo.status,
    width: photo.width,
    height: photo.height,
    capturedAt: photo.capturedAt?.toISOString() ?? null,
    sortAt: photo.sortAt.toISOString(),
    failureCode: photo.failureCode,
    media: {
      original: `${base}/original`,
      preview: derivativesReady ? `${base}/preview` : null,
      thumbnail: derivativesReady ? `${base}/thumbnail` : null,
    },
  };
}

export function presentUpload(upload: UploadHistoryItem): UploadSummary {
  return {
    id: upload.id,
    originalFilename: upload.originalFilename,
    status: upload.status,
    bytesReceived: upload.bytesReceived,
    errorCode: upload.errorCode,
    photoId: upload.photoId,
    createdAt: upload.createdAt.toISOString(),
  };
}
