import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlbumCover } from './album-cover.js';
import type { AlbumWallItem, AlbumWallYear } from './album-wall-types.js';
import { RedThread } from './red-thread.js';
import { getCorridorMetrics } from './corridor-metrics.js';
import { useAlbumCorridor } from './use-album-corridor.js';
import { AlbumPreviewDialog } from './album-preview-dialog.js';
import { albumWallThemes } from './album-wall-themes.js';
import { modernCorridorLayout } from './modern-corridor-layout.js';
import { ModernCorridorScene } from './modern-corridor-scene.js';
import { isKittyTheme } from '../themes/room-theme.js';
import { kittyLayout } from '../themes/kitty-layout.js';
import { KittyCorridor } from '../themes/kitty-corridor.js';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const SCENE_HEIGHT = 680;
const PinkRoom = lazy(() => import('../themes/pink-room.js'));

interface AlbumCorridorProps {
  compactHeader?: boolean;
  year: AlbumWallYear;
  autoPlay: boolean;
  focusAlbumId?: string | undefined;
  onCreate: () => void;
  onEdit: (album: AlbumWallItem) => void;
}

export function AlbumCorridor({ year, autoPlay, focusAlbumId, onCreate, onEdit, compactHeader = false }: AlbumCorridorProps) {
  const [openAlbum, setOpenAlbum] = useState<AlbumWallItem | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [sceneHeight, setSceneHeight] = useState(SCENE_HEIGHT);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const theme = albumWallThemes[year.themeId];
  const spatial = theme.id === 'kitty-dream';
  const [roomFocus, setRoomFocus] = useState<string | undefined>(focusAlbumId);
  const [roomFocusRevision, setRoomFocusRevision] = useState(0);
  useEffect(() => setRoomFocus(focusAlbumId), [focusAlbumId, year.year]);
  const { width: sceneWidth, anchors: originalAnchors } = useMemo(
    () => {
      if (!theme.modern) return getCorridorMetrics(year.albums.length, measuredWidth);
      if (isKittyTheme(theme.id)) {
        const result = kittyLayout(year.albums.length, measuredWidth, sceneHeight, theme.id);
        return { width: result.width, anchors: result.cards.map(card => ({ x: card.x + card.width / 2, threadY: card.y, connectorX: card.x, connectorY: card.y, side: 'below' as const })) };
      }
      const result = modernCorridorLayout(year.albums.length, measuredWidth, sceneHeight, theme.layout);
      return { width: result.width, anchors: result.cards.map(card => ({ x: card.x, threadY: card.y, connectorX: card.x, connectorY: card.y, side: 'below' as const })) };
    },
    [measuredWidth, year.albums.length, theme, sceneHeight],
  );
  const { viewportRef, viewportWidth, pause, reducedMotion } = useAlbumCorridor({ enabled: !spatial && autoPlay && !openAlbum, speed: 12, contentWidth: spatial ? measuredWidth : sceneWidth });
  const scale = sceneHeight / SCENE_HEIGHT;
  const anchors = useMemo(() => originalAnchors.map(anchor => ({ ...anchor, threadY: anchor.threadY * scale, connectorY: anchor.connectorY * scale })), [originalAnchors, scale]);
  useEffect(() => {
    const resize = () => {
      const top = (viewportRef.current?.getBoundingClientRect().top ?? 240) + window.scrollY;
      const available = window.innerHeight - top - 16;
      setSceneHeight(Math.max(360, spatial ? available : Math.min(SCENE_HEIGHT, available)));
    };
    resize();
    window.addEventListener('resize', resize);
    const observer = spatial && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    const wall = viewportRef.current?.closest('.album-wall');
    if (wall) observer?.observe(wall);
    return () => { window.removeEventListener('resize', resize); observer?.disconnect(); };
  }, [viewportRef, spatial]);
  useEffect(() => setMeasuredWidth(viewportWidth), [viewportWidth]);
  const lastOpenerRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (openAlbum === null) lastOpenerRef.current?.focus();
  }, [openAlbum]);

  useEffect(() => {
    if (!focusAlbumId) return;
    const focusKey = `${year.year}:${focusAlbumId}`;
    if (lastFocusKeyRef.current === focusKey) return;
    const albumIndex = year.albums.findIndex(({ id }) => id === focusAlbumId);
    if (albumIndex < 0) return;
    lastFocusKeyRef.current = focusKey;
    pause();
    viewportRef.current?.scrollTo?.({
      left: Math.max(0, anchors[albumIndex]!.x - 160),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [anchors, focusAlbumId, pause, viewportRef, year.albums, year.year, reducedMotion]);

  function openPreview(album: AlbumWallItem, opener: HTMLButtonElement) {
    lastOpenerRef.current = opener;
    pause();
    setOpenAlbum(album);
  }

  function jumpToMonth(month: number) {
    const albumIndex = year.albums.findIndex((album) => album.month === month);
    if (albumIndex < 0) return;
    if (spatial) { setRoomFocus(year.albums[albumIndex]!.id); setRoomFocusRevision(value => value + 1); return; }
    pause();
    viewportRef.current?.scrollTo({
      left: Math.max(0, anchors[albumIndex]!.x - 160),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }

  return (
    <section
      aria-label={`${year.year} 年相册廊`}
      className="album-corridor"
      onFocusCapture={pause}
      onPointerDown={pause}
      onPointerOver={(event) => { if ((event.target as Element).closest('.album-cover, .modern-album, .kitty-album')) pause(); }}
      onTouchStart={pause}
      onWheel={pause}
    >
      {!compactHeader ? <header className="album-corridor__heading">
        <div>
          <p>我们的故事还在继续</p>
          <h1>我们的 {year.year}</h1>
        </div>
        <div className="album-corridor__heading-actions">
          <button onClick={onCreate} type="button">新建相册</button>
        </div>
      </header> : null}
      <nav aria-label={`${year.year} 年月份跳转`} className="album-corridor__months">
        {MONTHS.map((month) => (
          <button
            disabled={!year.albums.some((album) => album.month === month)}
            key={month}
            onClick={() => jumpToMonth(month)}
            type="button"
          >
            {month}月
          </button>
        ))}
      </nav>
      <div className="album-corridor__stage" data-motion={autoPlay && !openAlbum && pageVisible && !reducedMotion ? 'running' : 'paused'}>
      {theme.modern && !isKittyTheme(theme.id) ? <div className={`theme-atmosphere theme-atmosphere--${theme.id}`} aria-hidden="true"><i /><i /><i /></div> : null}
      <div className="album-corridor__viewport" ref={viewportRef} style={{ height: sceneHeight, minHeight: sceneHeight }}>
        {spatial ? <Suspense fallback={<p role="status">正在准备粉色房间…</p>}><PinkRoom key={year.year} albums={year.albums} height={sceneHeight} focusAlbumId={roomFocus} focusRevision={roomFocusRevision} active={!openAlbum && pageVisible} autoPlay={autoPlay} onOpen={openPreview} /></Suspense> : isKittyTheme(theme.id) ? <KittyCorridor albums={year.albums} theme={theme.id} height={sceneHeight} viewportWidth={measuredWidth} onOpen={openPreview} /> : theme.modern ? <ModernCorridorScene albums={year.albums} theme={theme} height={sceneHeight} viewportWidth={measuredWidth} onOpen={openPreview} /> : <>
        <div className="album-corridor__scene" style={{ height: sceneHeight, width: sceneWidth, '--cover-scale': scale } as CSSProperties}>
          <RedThread anchors={anchors} height={sceneHeight} width={sceneWidth} />
          {year.albums.map((album, index) => (
            <AlbumCover
              album={album}
              anchor={anchors[index]!}
              key={album.id}
              onOpen={openPreview}
            />
          ))}
        </div>
        </>}
      </div>
      <div className="corridor-breeze" aria-hidden="true" hidden={theme.modern}>
        {[0, 1, 2, 3, 4].map(index => <svg className={`corridor-breeze__leaf corridor-breeze__leaf--${index}`} key={index} viewBox="0 0 48 28"><path d="M3 24C3 7 24 0 44 3 39 22 22 31 3 24Z" fill="currentColor"/><path d="M3 24 36 8M17 18 17 9M25 14 34 17" fill="none" stroke="#f6edd8" strokeWidth="1"/></svg>)}
        <svg className="corridor-breeze__wind" viewBox="0 0 600 150"><path d="M0 100C150 20 250 140 420 60S550 30 600 40M90 130C230 60 320 130 480 70" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
      </div>
      </div>
      {openAlbum ? (
        <AlbumPreviewDialog album={openAlbum} themeId={year.themeId} onClose={() => setOpenAlbum(null)} onEdit={onEdit} />
      ) : null}
    </section>
  );
}
