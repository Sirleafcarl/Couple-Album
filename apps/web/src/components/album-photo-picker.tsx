import type { PhotoSummary } from '@memory/contracts/photos';
import { useEffect, useState } from 'react';
import { getPhotos } from '../api/photos.js';
import { addAlbumPhotos } from '../api/albums.js';
import { PhotoSelectionBar } from './photo-selection-bar.js';

export function AlbumPhotoPicker({ albumId, onAdded }: { albumId: string; onAdded: () => void }) {
  const [owner, setOwner] = useState('all');
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setBusy(true);
    setError('');
    setPhotos([]);
    setSelected([]);
    void getPhotos({ owner }).then(result => {
      if (current) { setPhotos(result.items); setCursor(result.nextCursor); }
    }).catch(() => { if (current) setError('照片库暂时没有加载出来'); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [owner, revision]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await getPhotos({ owner, cursor });
      setPhotos(current => [...current, ...result.items]);
      setCursor(result.nextCursor);
    } catch { setError('更多照片加载失败，请重试'); }
    finally { setBusy(false); }
  }
  async function add() {
    setBusy(true);
    setError('');
    try { await addAlbumPhotos(albumId, selected); setSelected([]); onAdded(); }
    catch { setError('未能加入相册，请重试；照片库中的原图仍然保留。'); }
    finally { setBusy(false); }
  }
  return <section className="album-picker" aria-label="从照片库添加">
    <div className="wall-section-heading"><h2>从照片库挑选</h2>
      <div className="filter-group">
        <button disabled={busy} aria-pressed={owner === 'all'} onClick={() => setOwner('all')}>双方的照片</button>
        <button disabled={busy} aria-pressed={owner === 'me'} onClick={() => setOwner('me')}>我的照片</button>
        <button disabled={busy} aria-pressed={owner === 'partner'} onClick={() => setOwner('partner')}>对方的照片</button>
      </div>
    </div>
    <p>每次最多选择 100 张，已经在相册里的照片会自动跳过。</p>
    <PhotoSelectionBar selected={selected.length} loaded={photos.length} busy={busy}
      onSelect={() => setSelected(current => [...new Set([...current, ...photos.map(photo => photo.id)])].slice(0, 100))}
      onClear={() => setSelected([])} />
    {error ? <p role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>重新加载</button></p> : null}
    {busy ? <p role="status">正在处理…</p> : null}
    {!busy && !error && photos.length === 0 ? <p>这里还没有照片，可以先从本地上传。</p> : null}
    <div className="album-picker-grid">{photos.map(photo => <label key={photo.id} className={selected.includes(photo.id) ? 'is-selected' : ''}>
      <input type="checkbox" aria-label={`选择 ${photo.originalFilename}`} checked={selected.includes(photo.id)}
        disabled={busy || (!selected.includes(photo.id) && selected.length >= 100)}
        onChange={() => setSelected(current => current.includes(photo.id) ? current.filter(id => id !== photo.id) : [...current, photo.id])} />
      {photo.media.thumbnail ? <img loading="lazy" src={photo.media.thumbnail} alt="" /> : <span className="picker-placeholder">{photo.status === 'processing' ? '正在处理' : '暂无预览'}</span>}
      <strong>{photo.originalFilename}</strong><small>{photo.owner.displayName} 上传</small>
    </label>)}</div>
    <div className="wall-toolbar">
      {cursor ? <button disabled={busy} onClick={() => void more()}>加载更多照片</button> : null}
      <button className="wall-primary" disabled={busy || !selected.length} onClick={() => void add()}>加入相册（{selected.length}）</button>
    </div>
  </section>;
}
