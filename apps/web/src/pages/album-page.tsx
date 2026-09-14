import type { AlbumDetail } from '@memory/contracts/albums';
import type { PhotoSummary } from '@memory/contracts/photos';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlbumApiError, getAlbum, getAlbums, moveAlbumPhoto, removeAlbumPhoto, removeAlbumPhotos, setAlbumLayout } from '../api/albums.js';
import { AppShell } from '../components/app-shell.js';
import { AlbumPhotoPickerDialog } from '../components/album-photo-picker-dialog.js';
import { PhotoUploader } from '../components/photo-uploader.js';
import { PhotoViewer } from '../components/photo-viewer.js';
import { PhotoSelectionBar } from '../components/photo-selection-bar.js';
import { AlbumDetailHeader, visibleAlbumLayout } from '../components/album-detail-header.js';
import { useVisiblePolling } from '../hooks/use-visible-polling.js';
import type { AlbumWallThemeId } from '../album-wall/album-wall-types.js';

export function AlbumPage() {
  const { albumId = '' } = useParams();
  return <AlbumContent key={albumId} albumId={albumId} />;
}
function AlbumContent({ albumId }: { albumId: string }) {
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [yearTheme, setYearTheme] = useState<AlbumWallThemeId>();
  useEffect(() => {
    if (!detail) return;
    let current = true;
    void getAlbums().then(({ years }) => {
      const year = years.find(year => year.year === detail.album.year);
      if (current && year) setYearTheme(year.themeId);
    }).catch(() => { /* Keep the remembered world if the optional theme lookup fails. */ });
    return () => { current = false; };
  }, [detail?.album.year]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sorting, setSorting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchRemove, setBatchRemove] = useState(false);
  const [remove, setRemove] = useState<PhotoSummary | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  async function refresh() {
    const request = ++generation.current;
    try {
      const result = await getAlbum(albumId);
      if (request === generation.current) { setDetail(result); setSelected([]); setError(''); }
    } catch (err) {
      if (request === generation.current) setError(err instanceof AlbumApiError && err.status === 404 ? '这本相册不存在或已被移除。' : '相册暂时没有加载出来，请重试。');
    }
  }
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [albumId]);
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall || detail?.layout !== 'garden' || typeof ResizeObserver === 'undefined') return;
    const cards = [...wall.querySelectorAll<HTMLElement>('.wall-photo')];
    const measure = () => {
      const gap = parseFloat(getComputedStyle(wall).rowGap) || 28;
      for (const card of cards) card.style.gridRowEnd = `span ${Math.ceil((card.getBoundingClientRect().height + gap) / (8 + gap))}`;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(wall);
    cards.forEach(card => observer.observe(card));
    measure();
    return () => { observer.disconnect(); cards.forEach(card => { card.style.gridRowEnd = ''; }); };
  }, [detail?.layout, detail?.items, sorting]);
  // Re-read loaded pages while previews are being generated, preserving their current order.
  useVisiblePolling(!busy && !view && detail?.items.some(p => p.status === 'processing') === true, async () => {
    const request = generation.current;
    try {
      const pages: AlbumDetail[] = [];
      for (let offset = 0; offset < (detail?.items.length ?? 0); offset += 40) {
        pages.push(await getAlbum(albumId, offset, detail!.version));
      }
      if (request === generation.current && pages[0]) setDetail({ ...pages[0], items: pages.flatMap(p => p.items), nextOffset: pages.at(-1)!.nextOffset });
    } catch (err) { if (err instanceof AlbumApiError && err.status === 409) setNotice('相册有新变化，刷新后可以看到最新内容。'); }
  });
  useEffect(() => {
    if (!remove && !batchRemove) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
    return () => {
      if (dialog?.open) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); }
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [remove, batchRemove]);
  function closeDialog() { setRemove(null); setBatchRemove(false); }
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    generation.current++;
    setBusy(true); setError('');
    try { await action(); closeDialog(); setSelected([]); setNotice(message); await refresh(); }
    catch (err) {
      setError(err instanceof AlbumApiError && err.status === 409 ? '对方刚刚修改了相册，请刷新后再操作。' : '操作没有完成，请重试。');
    } finally { setBusy(false); }
  }
  async function more(): Promise<PhotoSummary[]> {
    if (!detail || detail.nextOffset === null || busy) return [];
    const request = ++generation.current;
    setBusy(true);
    try {
      const next = await getAlbum(albumId, detail.nextOffset, detail.version);
      if (request !== generation.current) return [];
      setDetail(current => current ? { ...next, items: [...current.items, ...next.items] } : next);
      return next.items;
    } catch (err) { throw new Error(err instanceof AlbumApiError && err.status === 409 ? '相册顺序有变化，请关闭看图并刷新相册后继续浏览。' : '更多照片没有加载出来，请重试。'); }
    finally { setBusy(false); }
  }
  return <AppShell theme={yearTheme}><main className="album-detail">
    {error ? <div className="wall-feedback" role="alert">{error} <button disabled={busy} onClick={() => void refresh()}>刷新相册</button></div> : null}
    {!detail && !error ? <p className="page-state">正在翻开这本相册…</p> : null}
    {detail ? <>
      <AlbumDetailHeader title={detail.album.title} date={detail.album.occurredOn} description={detail.album.description} layout={detail.layout} busy={busy} sorting={sorting}
        onUpload={() => fileInputRef.current?.click()} onLibrary={() => setAdding(true)} onSort={() => { setSorting(value => !value); setSelected([]); }}
        onLayout={layout => void mutate(() => setAlbumLayout(albumId, layout, detail.version), '相册布局已保存')} />
      {notice ? <p role="status" className="album-detail-notice">{notice}</p> : null}
      <PhotoUploader compact fileInputRef={fileInputRef} albumId={albumId} onUploaded={() => { void refresh(); setNotice(''); }} />
      {adding ? <AlbumPhotoPickerDialog albumId={albumId} onClose={() => setAdding(false)} onAdded={() => { void refresh(); setNotice('所选照片已加入相册。'); }} /> : null}
      {detail.total === 0 ? <section className="wall-empty"><span aria-hidden="true">✳</span><h2>这一页，等我们慢慢写</h2><p>把约会时拍下的照片放进来，让这一天有迹可循。</p><button onClick={() => setAdding(true)}>添加第一张照片</button></section> : null}
      {sorting ? <p>双方共用同一份顺序。用向前、向后调整；从相册移除不会删除照片库原图。</p> : null}
      {sorting ? <div className="album-batch-tools">
        <PhotoSelectionBar selected={selected.length} loaded={detail.items.length} busy={busy}
          onSelect={() => setSelected(current => [...new Set([...current, ...detail.items.map(photo => photo.id)])].slice(0, 100))}
          onClear={() => setSelected([])} />
        <button disabled={busy || !selected.length} onClick={() => { setError(''); setBatchRemove(true); }}>移除所选（{selected.length}）</button>
      </div> : null}
      <div ref={wallRef} className={`live-wall live-wall--${visibleAlbumLayout(detail.layout)}`} aria-label="相册照片">{detail.items.map((photo, index) => <figure key={photo.id} className="wall-photo">
        {sorting ? <label className="album-photo-select"><input type="checkbox" aria-label={`选择相册照片 ${photo.originalFilename}`}
          checked={selected.includes(photo.id)} disabled={busy || (!selected.includes(photo.id) && selected.length >= 100)}
          onChange={() => setSelected(current => current.includes(photo.id) ? current.filter(id => id !== photo.id) : [...current, photo.id].slice(0, 100))} />选择</label> : null}
        <button className="wall-photo-open" aria-label={`查看照片：${photo.originalFilename}`} onClick={() => setView(photo.id)}
          style={{ aspectRatio: detail.layout === 'garden' ? `${photo.width || 4} / ${photo.height || 3}` : undefined }}>
          {photo.media.thumbnail ? <img src={detail.layout === 'garden' ? photo.media.thumbnail : photo.media.preview ?? photo.media.thumbnail} alt={photo.originalFilename} loading="lazy" decoding="async" /> : <span className="wall-processing">{photo.status === 'processing' ? '原图已保存，正在生成预览' : '原图已保存，暂时无法生成预览'}</span>}
        </button>
        <figcaption><time>{(photo.capturedAt ?? photo.sortAt).slice(0, 10).replaceAll('-', '.')}</time><span title={photo.originalFilename}>{photo.originalFilename}</span></figcaption>
        {sorting ? <div className="wall-photo-actions">
          <button disabled={busy || index === 0} aria-label={`向前移动 ${photo.originalFilename}`} onClick={() => void mutate(() => moveAlbumPhoto(albumId, photo.id, detail.items[index - 1]!.id, detail.version), '顺序已保存')}>向前</button>
          <button disabled={busy || index === detail.items.length - 1} aria-label={`向后移动 ${photo.originalFilename}`} onClick={() => void mutate(() => moveAlbumPhoto(albumId, detail.items[index + 1]!.id, photo.id, detail.version), '顺序已保存')}>向后</button>
          <button disabled={busy} aria-label={`从相册移除 ${photo.originalFilename}`} onClick={() => setRemove(photo)}>移除</button>
        </div> : null}
      </figure>)}</div>
      {detail.nextOffset !== null ? <div className="wall-load-more"><button disabled={busy} onClick={() => void more().catch(err => setError(err.message))}>{busy ? '正在加载…' : '继续看照片'}</button><p>已展示 {detail.items.length} / {detail.total} 张</p></div> : null}
      <footer className="wall-footer"><span aria-hidden="true">✳</span><p>普通的一天，因为是和你。</p><small>{detail.total} 张照片 · 共同收藏</small><Link to="/">回到相册廊</Link></footer>
    </> : null}
    {view && detail ? <PhotoViewer photos={detail.items} initialId={view} total={detail.total} hasMore={detail.nextOffset !== null} loadMore={more} onClose={() => setView(null)} /> : null}
    <dialog ref={dialogRef} className="wall-dialog" onCancel={event => { event.preventDefault(); if (!busy) closeDialog(); }} aria-labelledby="wall-dialog-title">
      <button className="wall-dialog-close" aria-label="关闭弹窗" disabled={busy} onClick={closeDialog}>×</button>
      <h2 id="wall-dialog-title">从相册移除照片</h2>
      {batchRemove ? <><p>将 {selected.length} 张照片从当前相册移除。照片库原图和其他相册不受影响。</p>
        <button disabled={busy || !selected.length} onClick={() => detail && void mutate(() => removeAlbumPhotos(albumId, selected, detail.version), '所选照片已从相册移除，原图仍在照片库。')}>确认移除</button></> : null}
      {remove ? <><p>仅从当前相册移除「{remove.originalFilename}」。照片库原图和其他相册不受影响。</p>
        <button disabled={busy} onClick={() => detail && void mutate(() => removeAlbumPhoto(albumId, remove.id, detail.version), '已从相册移除，原图仍在照片库。')}>确认移除</button></> : null}
      {error ? <p role="alert">{error}</p> : null}
    </dialog>
  </main></AppShell>;
}
