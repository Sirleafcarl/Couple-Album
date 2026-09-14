import type { PhotoSummary } from '@memory/contracts/photos';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PhotoCard } from './photo-card.js';

export function columnCountForWidth(width: number): number {
  if (width >= 960) return 4;
  if (width >= 640) return 3;
  if (width >= 440) return 2;
  return 1;
}

export function VirtualPhotoGrid({ photos, ownerId, onDelete }: { photos: PhotoSummary[]; ownerId?: string | undefined; onDelete?: ((photo: PhotoSummary) => void) | undefined }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canVirtualize = typeof ResizeObserver !== 'undefined';
  const [columns, setColumns] = useState(() => columnCountForWidth(
    typeof window === 'undefined' ? 390 : window.innerWidth,
  ));
  const rows = useMemo(() => Array.from(
    { length: Math.ceil(photos.length / columns) },
    (_, index) => photos.slice(index * columns, (index + 1) * columns),
  ), [columns, photos]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 340,
    overscan: 2,
    useFlushSync: false,
    initialRect: { width: 800, height: 800 },
    enabled: canVirtualize,
  });

  useEffect(() => {
    if (!canVirtualize || !scrollRef.current) return;
    const element = scrollRef.current;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setColumns(columnCountForWidth(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [canVirtualize]);

  if (!canVirtualize) {
    return <div className="photo-grid-fallback">{photos.map((photo) => <PhotoCard key={photo.id} photo={photo} onDelete={photo.owner.id === ownerId ? onDelete : undefined} />)}</div>;
  }

  return (
    <div className="photo-grid-scroll" ref={scrollRef}>
      <div className="photo-grid" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const rowPhotos = rows[row.index];
          return rowPhotos?.length ? (
            <div
              className="photo-grid__row"
              data-index={row.index}
              key={rowPhotos[0]!.id}
              ref={virtualizer.measureElement}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                transform: `translateY(${row.start}px)`,
              }}
            >
              {rowPhotos.map((photo) => <PhotoCard key={photo.id} photo={photo} onDelete={photo.owner.id === ownerId ? onDelete : undefined} />)}
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}
