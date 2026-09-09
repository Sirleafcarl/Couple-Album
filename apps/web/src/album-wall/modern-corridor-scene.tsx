import type { CSSProperties } from 'react';
import type { AlbumWallItem, AlbumWallTheme } from './album-wall-types.js';
import { modernCorridorLayout } from './modern-corridor-layout.js';
import { RedThread } from './red-thread.js';

export function ModernCorridorScene({ albums, theme, height, viewportWidth, onOpen }: {
  albums: AlbumWallItem[]; theme: AlbumWallTheme; height: number; viewportWidth: number;
  onOpen(album: AlbumWallItem, opener: HTMLButtonElement): void;
}) {
  const { width, cards } = modernCorridorLayout(albums.length, viewportWidth, height, theme.layout);
  const hanging = theme.layout === 'hanging';
  const anchors = cards.map(card => ({ x: card.x, threadY: card.y - 8, connectorX: card.x, connectorY: card.y - 8, side: 'below' as const }));
  return <div className={`modern-corridor modern-corridor--${theme.layout}`} style={{ width, height }}>
    <RedThread anchors={anchors} width={width} height={height} />
    {albums.map((album, index) => {
      const card = cards[index]!;
      return <article className="modern-album" key={album.id} style={{ left: card.x - card.width / 2, top: card.y, width: card.width, '--album-angle': `${card.angle}deg`, '--sway-delay': `${-(index % 4) * 2}s` } as CSSProperties}>
        {hanging ? <span className="modern-album__hanger" aria-hidden="true" /> : null}
        <button type="button" aria-label={`打开相册：${album.title}`} onClick={event => onOpen(album, event.currentTarget)}>
          <span className="modern-album__image">{album.coverUrl ? <img alt="" src={album.coverUrl} loading="lazy" decoding="async" /> : <span className="modern-album__empty"><span>{String(index + 1).padStart(2, '0')}</span>等待我们的照片</span>}</span>
          <span className="modern-album__caption"><time dateTime={album.occurredOn}>{album.occurredOn.replaceAll('-', '.')}</time><strong>{album.title}</strong></span>
        </button>
      </article>;
    })}
  </div>;
}
