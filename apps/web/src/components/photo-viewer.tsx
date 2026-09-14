import type { PhotoSummary } from '@memory/contracts/photos';
import { useEffect, useRef, useState } from 'react';
import './photo-viewer.css';

type Props = { photos: PhotoSummary[]; initialId: string; total: number; hasMore: boolean; loadMore(): Promise<PhotoSummary[]>; onClose(): void };
export function PhotoViewer({ photos, initialId, total, hasMore, loadMore, onClose }: Props) {
  const [id, setId] = useState(initialId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const loading = useRef(false);
  const alive = useRef(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const index = photos.findIndex(photo => photo.id === id);
  const photo = photos[index];
  useEffect(() => {
    alive.current = true;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
      if (dialog?.open) dialog.close?.();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  async function navigate(direction: -1 | 1) {
    if (loading.current || index < 0) return;
    const next = photos[index + direction];
    if (next) { setId(next.id); setError(''); return; }
    if (direction < 0 || !hasMore) return;
    loading.current = true; setPending(true); setError('');
    try {
      const added = await loadMore();
      if (alive.current && added[0]) setId(added[0].id);
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : '更多照片没有加载出来，请重试。');
    } finally {
      loading.current = false;
      if (alive.current) setPending(false);
    }
  }
  return <dialog ref={dialogRef} className="photo-viewer" aria-label="照片查看器" aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); void navigate(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }}>
    <header className="photo-viewer__header"><div><strong title={photo?.originalFilename}>{photo?.originalFilename ?? '正在载入…'}</strong><small>{photo?.owner.displayName} 上传</small></div>
      <button ref={closeRef} aria-label="关闭看图" onClick={onClose}>关闭 ×</button></header>
    {photo ? <PhotoStage key={`${photo.id}:${photo.media.preview}`} photo={photo} navigate={navigate} /> : <p role="status">正在加载照片…</p>}
    <footer className="photo-viewer__navigation">
      <button aria-label="上一张" disabled={pending || index <= 0} onClick={() => void navigate(-1)}>← 上一张</button>
      <span aria-live="polite">{pending ? '正在加载…' : `${index + 1} / ${total}`}</span>
      <button aria-label="下一张" disabled={pending || (!hasMore && index >= photos.length - 1)} onClick={() => void navigate(1)}>下一张 →</button>
    </footer>
    {error ? <p className="photo-viewer__error" role="alert">{error}</p> : null}
  </dialog>;
}

const clampScale = (value: number) => Math.min(4, Math.max(1, value));
function PhotoStage({ photo, navigate }: { photo: PhotoSummary; navigate(direction: -1 | 1): Promise<void> }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(photo.media.preview ? 'loading' : 'error');
  const [retry, setRetry] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const gesture = useRef<{ x: number; y: number; panX: number; panY: number; distance: number; scale: number; multi: boolean } | null>(null);
  const mouse = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  function zoom(value: number) { setScale(clampScale(value)); setPan({ x: 0, y: 0 }); }
  function move(x: number, y: number) {
    const image = imageRef.current;
    const stage = stageRef.current;
    const maxX = image && stage ? Math.max(0, (image.clientWidth * scale - stage.clientWidth) / 2) : 0;
    const maxY = image && stage ? Math.max(0, (image.clientHeight * scale - stage.clientHeight) / 2) : 0;
    setPan({ x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) });
  }
  return <>
    <div ref={stageRef} className="photo-viewer__stage" data-testid="photo-viewer-stage"
      onPointerDown={event => {
        if (event.pointerType !== 'mouse' || scale === 1) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        mouse.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      }}
      onPointerMove={event => { const start = mouse.current; if (start) move(start.panX + event.clientX - start.x, start.panY + event.clientY - start.y); }}
      onPointerUp={() => { mouse.current = null; }} onPointerCancel={() => { mouse.current = null; }}
      onTouchStart={event => {
        const first = event.touches[0]; const second = event.touches[1];
        if (!first) return;
        gesture.current = { x: first.clientX, y: first.clientY, panX: pan.x, panY: pan.y, scale,
          distance: second ? Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) : 0, multi: !!second };
      }}
      onTouchMove={event => {
        const start = gesture.current; const first = event.touches[0]; const second = event.touches[1];
        if (!start || !first) return;
        if (second && start.distance > 0) {
          start.multi = true;
          zoom(start.scale * Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) / start.distance);
        } else if (!start.multi && scale > 1) move(start.panX + first.clientX - start.x, start.panY + first.clientY - start.y);
      }}
      onTouchEnd={event => {
        const start = gesture.current; const end = event.changedTouches[0];
        if (event.touches.length) return;
        gesture.current = null;
        if (!start || !end || start.multi || start.scale > 1 || scale > 1) return;
        const dx = end.clientX - start.x; const dy = end.clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) void navigate(dx < 0 ? 1 : -1);
      }} onTouchCancel={() => { gesture.current = null; }}>
      {photo.media.preview ? <img ref={imageRef} key={retry} src={photo.media.preview} alt={photo.originalFilename} draggable={false}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, visibility: status === 'ready' ? 'visible' : 'hidden' }}
        onLoad={() => setStatus('ready')} onError={() => setStatus('error')} /> : null}
      {status === 'loading' ? <p className="photo-viewer__state" role="status">正在加载照片…</p> : null}
      {status === 'error' ? <div className="photo-viewer__state" role="alert"><p>预览暂不可用，原图仍然保留。</p>
        {photo.media.preview ? <button onClick={() => { setStatus('loading'); setRetry(value => value + 1); }}>重试预览</button> : null}</div> : null}
    </div>
    <div className="photo-viewer__tools">
      <button aria-label="缩小" disabled={scale <= 1} onClick={() => zoom(scale - .5)}>−</button>
      <button aria-label="复位缩放" onClick={() => zoom(1)}>{Math.round(scale * 100)}%</button>
      <button aria-label="放大" disabled={scale >= 4} onClick={() => zoom(scale + .5)}>＋</button>
      <a href={photo.media.original} download>下载原图</a>
    </div>
  </>;
}
