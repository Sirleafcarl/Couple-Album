import { useEffect, useState } from 'react';
import type { TrashListResponse } from '@memory/contracts/photos';
import { Link } from 'react-router-dom';
import { getTrash, PhotoApiError, restorePhoto } from '../api/photos.js';
import { AppShell } from '../components/app-shell.js';
import '../components/photo-library.css';

export function TrashPage() {
  const [page, setPage] = useState<TrashListResponse>();
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState('');
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [tick, setTick] = useState(Date.now());
  const cursor = cursors.at(-1);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    void getTrash(cursor).then(result => { if (active) { setPage(result); setReceivedAt(Date.now()); setTick(Date.now()); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, revision]);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const serverTime = page ? Date.parse(page.serverNow) + Math.max(0, tick - receivedAt) : tick;
  async function restore(id: string) {
    if (busy) return;
    setBusy(id); setNotice('');
    try { await restorePhoto(id); setNotice('照片已恢复，原相册中的位置也已保留。'); setRevision(value => value + 1); }
    catch (error) {
      setNotice(error instanceof PhotoApiError && error.code === 'PHOTO_EXPIRED' ? '这张照片已超过 30 天恢复期限。'
        : error instanceof PhotoApiError && error.code === 'ORIGINAL_MISSING' ? '原图文件缺失，暂时无法恢复，请检查媒体存储。' : '恢复失败，请稍后重试。');
    } finally { setBusy(undefined); }
  }
  return <AppShell><main className="library-page trash-page">
    <header className="page-heading"><div><p className="eyebrow">给回忆一次反悔的机会</p><h1>回收站</h1><p>仅显示你删除的照片 · 保留 30 天</p></div><Link to="/library">返回照片库</Link></header>
    {notice ? <p className="library-notice" role="status">{notice}</p> : null}
    {loading ? <p role="status">正在整理回收站…</p> : null}
    {error ? <div role="alert"><p>回收站暂时没有加载出来</p><button type="button" onClick={() => setRevision(value => value + 1)}>重新加载</button></div> : null}
    {!loading && !error && page?.items.length === 0 ? <div className="trash-empty"><h2>回收站是空的</h2><p>暂时收起的照片会在这里等待你。</p></div> : null}
    {!error && page?.items.length ? <div className="trash-grid">{page.items.map(photo => {
      const remaining = Date.parse(photo.expiresAt) - serverTime;
      return <article className="trash-photo" key={photo.id}>
        <div className="trash-photo__image">{photo.thumbnail && remaining > 0 ? <img src={photo.thumbnail} alt={photo.originalFilename} loading="lazy" /> : <span>暂存的回忆</span>}</div>
        <strong title={photo.originalFilename}>{photo.originalFilename}</strong>
        <small>{new Date(photo.deletedAt).toLocaleDateString('zh-CN')} 删除</small>
        <div><span>{remaining <= 0 ? '已到期' : remaining < 86400000 ? '不足 1 天' : `剩余 ${Math.ceil(remaining / 86400000)} 天`}</span>
          <button type="button" disabled={!!busy || remaining <= 0 || loading} aria-label={`恢复 ${photo.originalFilename}`} onClick={() => void restore(photo.id)}>{busy === photo.id ? '恢复中…' : '恢复'}</button></div>
      </article>;
    })}</div> : null}
    <nav className="pagination" aria-label="回收站分页"><button type="button" disabled={cursors.length <= 1 || loading || !!busy} onClick={() => setCursors(values => values.slice(0, -1))}>上一页</button><span>第 {cursors.length} 页</span><button type="button" disabled={!page?.nextCursor || loading || !!busy} onClick={() => { if (page?.nextCursor) setCursors(values => [...values, page.nextCursor!]); }}>下一页</button></nav>
    <p className="trash-footnote">30 天从删除时刻开始计算。到期后不可恢复，服务运行时会自动清理文件。</p>
  </main></AppShell>;
}
