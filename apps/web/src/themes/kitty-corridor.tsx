import type { CSSProperties } from 'react';
import type { AlbumWallItem } from '../album-wall/album-wall-types.js';
import type { KittyTheme } from './room-theme.js';
import { kittyLayout } from './kitty-layout.js';

export function KittyCorridor({ albums, theme, height, viewportWidth, onOpen }: {
  albums: AlbumWallItem[]; theme: KittyTheme; height: number; viewportWidth: number;
  onOpen(album: AlbumWallItem, opener: HTMLButtonElement): void;
}) {
  const { width, cards, bays } = kittyLayout(albums.length, viewportWidth, height, theme);
  return <div className={`kitty-corridor kitty-corridor--${theme}`} style={{ width, height }}>
    {bays.map((bay, index) => <img key={index} className={theme === 'kitty-dream' ? 'kitty-cabinet' : 'kitty-gallery-island'} data-mirrored={theme === 'kitty-gallery' && index % 2 === 1} src={theme === 'kitty-dream' ? '/themes/kitty-dream/cabinet-v3.webp' : '/themes/kitty-gallery/island-v3.webp'} alt="" style={{ left: bay.x, top: bay.y, width: bay.width, height: bay.height }} />)}
    {albums.map((album, index) => {
      const box = cards[index]!;
      return <article key={album.id} className="kitty-album" data-depth={box.depth} style={{ left: box.x, top: box.y, width: box.width, height: box.height, '--kitty-delay': `${-(index % 4) * 2}s` } as CSSProperties}>
        <button type="button" aria-label={`打开相册：${album.title}`} onClick={event => onOpen(album, event.currentTarget)}>
          <span className="kitty-album__photo">{album.coverUrl ? <img src={album.coverUrl} alt="" loading="lazy" decoding="async" /> : <span>等待我们的照片</span>}</span>
          <span className="kitty-album__caption"><strong title={album.title}>{album.title}</strong><time dateTime={album.occurredOn}>{album.occurredOn.replaceAll('-', '.')}</time></span>
        </button>
        {theme === 'kitty-dream' && index % 6 === 0 ? <img className="kitty-display-friend" src={`/themes/${theme}/character.webp`} alt="" /> : null}
      </article>;
    })}
  </div>;
}
