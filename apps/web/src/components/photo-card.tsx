import type { PhotoSummary } from '@memory/contracts/photos';

export function PhotoCard({ photo, onDelete }: { photo: PhotoSummary; onDelete?: ((photo: PhotoSummary) => void) | undefined }) {
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
        {onDelete ? <button className="photo-card__trash" type="button" aria-label={`移入回收站 ${photo.originalFilename}`} onClick={() => onDelete(photo)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" /></svg>
        </button> : null}
      </div>
    </article>
  );
}
