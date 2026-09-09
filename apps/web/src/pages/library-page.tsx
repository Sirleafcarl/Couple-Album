import type { PhotoListResponse } from '@memory/contracts/photos';
import { useEffect, useState } from 'react';
import { getPhotos } from '../api/photos.js';
import { useAuth } from '../auth/auth-provider.js';
import { AppShell } from '../components/app-shell.js';
import { VirtualPhotoGrid } from '../components/virtual-photo-grid.js';
import { useVisiblePolling } from '../hooks/use-visible-polling.js';

type Page = { cursor?: string; response: PhotoListResponse };

export function LibraryPage() {
  const { user } = useAuth();
  const [owner, setOwner] = useState('all');
  const [pages, setPages] = useState<Page[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const page = pages[pageIndex];
  useVisiblePolling(
    page?.response.items.some((photo) => photo.status === 'processing') === true,
    () => { void refreshCurrentPage(); },
  );

  async function refreshCurrentPage() {
    if (!page) return;
    try {
      const response = await getPhotos(page.cursor ? { owner, cursor: page.cursor } : { owner });
      setPages((current) => current.map((entry, index) => index === pageIndex
        ? { ...entry, response }
        : entry));
    } catch {
      // A background refresh should not replace already visible photos.
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void getPhotos({ owner }).then((response) => {
      if (active) {
        setPages([{ response }]);
        setPageIndex(0);
      }
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [owner, revision, user?.id]);

  async function nextPage() {
    const cursor = page?.response.nextCursor;
    if (!cursor) return;
    setLoading(true);
    setError(false);
    try {
      const response = await getPhotos({ owner, cursor });
      setPages((current) => [...current.slice(0, pageIndex + 1), { cursor, response }]);
      setPageIndex((current) => current + 1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function chooseOwner(value: string) {
    setPages([]);
    setPageIndex(0);
    setOwner(value);
  }

  return (
    <AppShell>
      <main className="library-page">
        <header className="page-heading">
          <div><p className="eyebrow">每一张，都有它的位置</p><h1>我们的照片</h1></div>
          <div className="filter-group" aria-label="照片所有者筛选">
            <button onClick={() => chooseOwner('all')} type="button">全部照片</button>
            <button onClick={() => chooseOwner('me')} type="button">我的照片</button>
            <button onClick={() => chooseOwner('partner')} type="button">TA 的照片</button>
          </div>
        </header>

        {loading && !page ? <p className="page-state">正在整理照片…</p> : null}
        {error ? <section className="page-state"><p>照片暂时没有加载出来</p><button type="button" onClick={() => setRevision((value) => value + 1)}>重新加载</button></section> : null}
        {!loading && !error && page?.response.items.length === 0 ? <p className="page-state">照片库还是空的</p> : null}
        {page?.response.items.length ? <VirtualPhotoGrid photos={page.response.items} /> : null}

        {page ? (
          <nav className="pagination" aria-label="照片分页">
            <button disabled={pageIndex === 0} onClick={() => setPageIndex((value) => value - 1)} type="button">上一页</button>
            <span>第 {pageIndex + 1} 页</span>
            <button disabled={!page.response.nextCursor || loading} onClick={() => void nextPage()} type="button">下一页</button>
          </nav>
        ) : null}
      </main>
    </AppShell>
  );
}
