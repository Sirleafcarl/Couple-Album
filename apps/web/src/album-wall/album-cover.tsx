import type { CSSProperties, MouseEvent } from 'react';
import type { AlbumWallItem } from './album-wall-types.js';
import type { AlbumAnchor } from './thread-layout.js';

interface AlbumCoverProps {
  album: AlbumWallItem;
  anchor: AlbumAnchor;
  onOpen: (album: AlbumWallItem, opener: HTMLButtonElement) => void;
}

type AlbumPosition = CSSProperties & {
  '--anchor-x': string;
  '--anchor-y': string;
  '--connector-y': string;
};

export function AlbumCover({ album, anchor, onOpen }: AlbumCoverProps) {
  const style: AlbumPosition = {
    '--anchor-x': `${anchor.x}px`,
    '--anchor-y': `${anchor.threadY}px`,
    '--connector-y': `${anchor.connectorY}px`,
  };

  function handleOpen(event: MouseEvent<HTMLButtonElement>) {
    onOpen(album, event.currentTarget);
  }

  return (
    <article className={`album-cover album-cover--${anchor.side}`} style={style}>
      <span aria-hidden="true" className="album-cover__connector" />
      <button aria-label={`打开相册：${album.title}`} onClick={handleOpen} type="button">
        <span className="album-cover__photo">
          {album.coverUrl ? <img alt="" src={album.coverUrl} loading="lazy" decoding="async" /> : <span>等待我们的照片</span>}
        </span>
        <span className="album-cover__copy">
          <strong>{album.title}</strong>
          <time dateTime={album.occurredOn}>{album.occurredOn}</time>
          <small>{album.description}</small>
        </span>
      </button>
    </article>
  );
}
