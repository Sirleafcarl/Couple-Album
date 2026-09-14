import { useEffect, useId, useRef } from 'react';
import type { AlbumWallItem, AlbumWallThemeId } from './album-wall-types.js';
import './album-preview-dialog.css';
import { albumWallThemes } from './album-wall-themes.js';

export function AlbumPreviewDialog({ album, themeId, onClose, onEdit }: {
  album: AlbumWallItem; themeId: AlbumWallThemeId; onClose(): void; onEdit(album: AlbumWallItem): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const theme = albumWallThemes[themeId];
  const cover = album.coverUrl || theme.background || (!theme.modern ? `/themes/${themeId}/scene.webp` : null);
  useEffect(() => {
    const node = dialog.current;
    if (node?.showModal) node.showModal();
    else node?.setAttribute('open', '');
    close.current?.focus({ preventScroll: true });
    return () => { if (node?.open) node.close?.(); };
  }, []);
  return <dialog ref={dialog} className="album-frontispiece" data-preview-theme={themeId} aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <button ref={close} className="album-frontispiece__close" type="button" aria-label="关闭相册预览" onClick={onClose}>×</button>
    <div className="album-frontispiece__layout">
      <aside className="album-frontispiece__cover">
        <div className="album-frontispiece__book">
          {cover ? <img src={cover} alt={`${album.title}的封面`} /> : <div className="modern-preview-empty">{album.title}<small>等待我们的照片</small></div>}
          <span aria-hidden="true" className="album-frontispiece__ribbon" />
          <span className="album-frontispiece__book-note">{themeId === 'sacred-joy' ? 'A LITTLE MIRACLE' : 'OUR LITTLE STORY'}</span>
        </div>
        <p>{themeId === 'sacred-joy' ? '平凡的一天，也值得被加冕' : '把这一天，轻轻收藏。'}</p>
      </aside>
      <section className="album-frontispiece__details">
        <p className="album-frontispiece__eyebrow">{themeId === 'sacred-joy' ? '云端珍藏 · 我们的小小神迹' : '这一页属于我们'}</p>
        <time dateTime={album.occurredOn}>{album.occurredOn.replaceAll('-', ' · ')}</time>
        <h2 id={titleId}>{album.title}</h2>
        {album.description.trim() ? <p className="album-frontispiece__story">{album.description}</p> : null}
        <div className="album-frontispiece__rule" aria-hidden="true" />
        <div className="album-frontispiece__actions">
          <a href={`/albums/${album.id}`} aria-label="进入相册">翻开相册 <span aria-hidden="true">→</span></a>
          <button type="button" onClick={() => { onClose(); onEdit(album); }}>编辑相册</button>
        </div>
      </section>
    </div>
  </dialog>;
}
