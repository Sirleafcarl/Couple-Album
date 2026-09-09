import type { PhotoSummary } from '@memory/contracts/photos';

export function PhotoCard({ photo }: { photo: PhotoSummary }) {
  return (
    <article className={`photo-card photo-card--${photo.status}`}>
      <div className="photo-card__visual">
        {photo.media.thumbnail ? (
          <a href={photo.media.preview ?? photo.media.original} aria-label={`查看 ${photo.owner.displayName} 上传的照片`}>
            <img
              alt={`${photo.owner.displayName} 上传的照片`}
              loading="lazy"
              src={photo.media.thumbnail ?? undefined}
            />
          </a>
        ) : photo.status === 'processing' ? (
          <span className="photo-card__state">正在处理</span>
        ) : (
          <span className="photo-card__state photo-card__state--error">处理失败</span>
        )}
      </div>
      <div className="photo-card__meta">
        <strong>{photo.originalFilename}</strong>
        <span>{photo.owner.displayName} 的照片</span>
      </div>
    </article>
  );
}
