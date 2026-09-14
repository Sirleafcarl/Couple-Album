import { useEffect, useState, type Ref, type ReactNode } from 'react';
import type { AlbumSummary } from '@memory/contracts/albums';
import type { UploadSummary } from '@memory/contracts/photos';
import { getAlbums } from '../api/albums.js';
import { getUploads } from '../api/photos.js';
import { PhotoUploader } from './photo-uploader.js';
import { useVisiblePolling } from '../hooks/use-visible-polling.js';

export function UploadHistory() {
  const [items, setItems] = useState<UploadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useVisiblePolling(items.some(item => item.status === 'receiving'), () => setRevision(value => value + 1));
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    void getUploads().then(result => { if (active) setItems(result.items); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const statuses = { receiving: '正在接收', committed: '已进入照片库', duplicate: '重复照片', failed: '上传失败' };
  const errors: Record<string, string> = { UNSUPPORTED_IMAGE: '文件不是支持的图片格式', UPLOAD_TOO_LARGE: '照片超过了大小限制', EMPTY_UPLOAD: '照片文件是空的', INSUFFICIENT_STORAGE: '存储空间不足' };
  function bytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }
  return <section aria-label="最近上传" className="library-upload-history">
    {loading ? <p>正在加载上传记录…</p> : null}
    {error ? <div role="alert"><p>上传记录暂时没有加载出来</p><button type="button" onClick={() => setRevision(value => value + 1)}>重新加载记录</button></div> : null}
    {!loading && !error && items.length === 0 ? <p>还没有上传记录</p> : null}
    {!error ? <ul className="upload-history-list">{items.map(item => <li key={item.id}>
      <div><strong>{item.originalFilename}</strong><span>{bytes(item.bytesReceived)}</span></div>
      <span>{statuses[item.status]}</span>{item.errorCode ? <small>{errors[item.errorCode] ?? '照片未能上传，请重试'}</small> : null}
    </li>)}</ul> : null}
  </section>;
}

function UploadTarget({ target, onChange }: { target: string; onChange(value: string): void }) {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void getAlbums().then(result => { if (active) setAlbums(result.years.flatMap(year => year.albums)); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return <label>上传后同时加入<select value={target} onChange={event => onChange(event.target.value)}>
    <option value="">只加入我的照片库</option>
    {albums.map(album => <option key={album.id} value={album.id}>{album.title} · {album.occurredOn}</option>)}
  </select>{error ? <small role="alert">相册列表暂不可用，仍可上传到照片库。</small> : null}</label>;
}

export function LibraryUploadTools({ inputRef, onUploaded, toolbar }: { inputRef: Ref<HTMLInputElement>; onUploaded(): void; toolbar: ReactNode }) {
  const [target, setTarget] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  return <>
    <header className="library-command-bar">
    {toolbar}
    <details className="page-tools-more" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
    <summary>更多</summary>
    <div className="page-tools-more__panel library-upload-disclosures">
      <details onToggle={event => setOptionsOpen(event.currentTarget.open)}><summary>上传选项{target ? ' · 已选相册' : ''}</summary>
        {optionsOpen ? <UploadTarget target={target} onChange={setTarget} /> : null}
      </details>
      <details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>最近上传</summary>
        {historyOpen ? <UploadHistory key={revision} /> : null}
      </details>
    </div>
    </details>
    </header>
    <PhotoUploader compact fileInputRef={inputRef} albumId={target || undefined} onUploaded={() => { onUploaded(); setRevision(value => value + 1); }} />
  </>;
}
