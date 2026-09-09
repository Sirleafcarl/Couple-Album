import type { UploadStatus, UploadSummary } from '@memory/contracts/photos';
import { useEffect, useState } from 'react';
import type { AlbumSummary } from '@memory/contracts/albums';
import { getAlbums } from '../api/albums.js';
import { Link } from 'react-router-dom';
import { getUploads } from '../api/photos.js';
import { AppShell } from '../components/app-shell.js';
import { PhotoUploader } from '../components/photo-uploader.js';
import { useVisiblePolling } from '../hooks/use-visible-polling.js';

const statusLabels: Record<UploadStatus, string> = {
  receiving: '正在接收',
  committed: '已进入照片库',
  duplicate: '重复照片',
  failed: '上传失败',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function failureLabel(code: string): string {
  const labels: Record<string, string> = {
    UNSUPPORTED_IMAGE: '文件不是支持的图片格式',
    UPLOAD_TOO_LARGE: '照片超过了大小限制',
    EMPTY_UPLOAD: '照片文件是空的',
    INSUFFICIENT_STORAGE: '存储空间不足',
  };
  return labels[code] ?? '照片未能上传，请重试';
}

export function UploadsPage() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [target, setTarget] = useState('');
  const [albumError, setAlbumError] = useState(false);
  useEffect(() => {
    let active = true;
    void getAlbums().then(result => { if (active) setAlbums(result.years.flatMap(year => year.albums)); })
      .catch(() => { if (active) setAlbumError(true); });
    return () => { active = false; };
  }, []);
  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useVisiblePolling(
    uploads.some((upload) => upload.status === 'receiving'),
    () => setRevision((value) => value + 1),
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void getUploads().then((response) => {
      if (active) setUploads(response.items);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [revision]);

  return (
    <AppShell>
      <main className="uploads-page">
        <header className="page-heading">
          <div><p className="eyebrow">把今天，放进我们的故事</p><h1>上传照片</h1></div>
          <p>原图会安全保存，预览图会在后台自动生成。</p>
        </header>
        <div className="upload-target"><label>放到哪里<select value={target} onChange={event => setTarget(event.target.value)}>
          <option value="">只加入我的照片库</option>
          {albums.map(album => <option key={album.id} value={album.id}>{album.title} · {album.occurredOn}</option>)}
        </select></label>{target ? <Link to={`/albums/${target}`}>打开目标相册</Link> : null}</div>
        {albumError ? <p role="alert">相册列表暂不可用，仍可上传到照片库。</p> : null}
        <PhotoUploader albumId={target || undefined} onUploaded={() => setRevision((value) => value + 1)} />

        <section className="upload-history" aria-labelledby="upload-history-title">
          <h2 id="upload-history-title">最近上传</h2>
          {loading ? <p>正在加载上传记录…</p> : null}
          {error ? (
            <div className="page-state">
              <p>上传记录暂时没有加载出来</p>
              <button type="button" onClick={() => setRevision((value) => value + 1)}>重新加载记录</button>
            </div>
          ) : null}
          {!loading && !error && uploads.length === 0 ? <p>还没有上传记录</p> : null}
          {!error && uploads.length > 0 ? (
            <ul className="upload-history-list">
              {uploads.map((upload) => (
                <li key={upload.id}>
                  <div><strong>{upload.originalFilename}</strong><span>{formatBytes(upload.bytesReceived)}</span></div>
                  <span className={`upload-status upload-status-${upload.status}`}>{statusLabels[upload.status]}</span>
                  {upload.errorCode ? <small>{failureLabel(upload.errorCode)}</small> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}
