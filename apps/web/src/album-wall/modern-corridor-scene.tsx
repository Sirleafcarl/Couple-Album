import type { CSSProperties } from 'react';
import type { AlbumWallItem, AlbumWallTheme } from './album-wall-types.js';
import { modernCorridorLayout } from './modern-corridor-layout.js';
import { RedThread } from './red-thread.js';

export function ModernCorridorScene({ albums, theme, height, viewportWidth, onOpen }: {
  albums: AlbumWallItem[]; theme: AlbumWallTheme; height: number; viewportWidth: number;
  onOpen(album: AlbumWallItem, opener: HTMLButtonElement): void;
}) {
  const { width, cards } = modernCorridorLayout(albums.length, viewportWidth, height, theme.layout);
  const connected = theme.id === 'cloud-candy';
  const anchors = cards.map(card => ({ ...card, connectorX: card.x }));
  return <div className={`modern-corridor modern-corridor--${theme.layout}`} style={{ width, height }}>
    {connected ? <><RedThread anchors={anchors} width={width} height={height} />
      <svg className="modern-connectors" width={width} height={height} aria-hidden="true">
        {cards.map((card, index) => <line key={index} x1={card.x} x2={card.x} y1={card.threadY} y2={card.connectorY} />)}
      </svg></> : null}
    {albums.map((album, index) => {
      const card = cards[index]!;
      return <article className="modern-album" data-connected={connected} data-side={card.side} key={album.id} style={{ left: card.x - card.width / 2, top: card.y, width: card.width, '--image-height': `${card.imageHeight}px`, '--album-height': `${card.height}px`, '--album-angle': `${connected ? 0 : card.angle}deg`, '--sway-delay': `${-(index % 4) * 2}s` } as CSSProperties}>
        <button type="button" aria-label={`打开相册：${album.title}`} onClick={event => onOpen(album, event.currentTarget)}>
          {theme.id === 'sacred-joy' ? <><span className="sacred-album__halo" aria-hidden="true" /><span className="sacred-album__cloud" aria-hidden="true" /></> : null}
          <span className="modern-album__image">{album.coverUrl ? <img alt="" src={album.coverUrl} loading="lazy" decoding="async" /> : <span className="modern-album__empty"><span>{String(index + 1).padStart(2, '0')}</span>等待我们的照片</span>}</span>
          <span className="modern-album__caption"><time dateTime={album.occurredOn}>{album.occurredOn.replaceAll('-', '.')}</time><strong>{album.title}</strong></span>
        </button>
      </article>;
    })}
  </div>;
}
