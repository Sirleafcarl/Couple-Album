import type { AlbumSummary } from '@memory/contracts/albums';
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlbumCorridor } from '../album-wall/album-corridor.js';
import { AlbumEditorDialog } from '../album-wall/album-editor-dialog.js';
import { AlbumWallEmptyState } from '../album-wall/album-wall-empty-state.js';
import { AlbumWallThemePicker } from '../album-wall/album-wall-theme-picker.js';
import { albumWallThemes } from '../album-wall/album-wall-themes.js';
import { AlbumYearPicker } from '../album-wall/album-year-picker.js';
import { RelationshipTimer } from '../album-wall/relationship-timer.js';
import { useAlbumWallData } from '../album-wall/use-album-wall-data.js';
import { useAuth } from '../auth/auth-provider.js';
import { AppShell } from '../components/app-shell.js';

function todayInLocalTime(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function HomePage() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const albums = useAlbumWallData();
  const [signingOut, setSigningOut] = useState(false);
  const [editor, setEditor] = useState<'create' | AlbumSummary | null>(null);
  const [focusAlbumId, setFocusAlbumId] = useState<string | undefined>();
  const [themeError, setThemeError] = useState(false);
  const selectedThemeId = albums.selected?.themeId ?? 'secret-garden';
  const theme = albumWallThemes[selectedThemeId];
  const configuredStartedAt = import.meta.env.VITE_RELATIONSHIP_STARTED_AT;
  const relationshipStartedAt = configuredStartedAt ? new Date(configuredStartedAt) : null;
  const validStart = relationshipStartedAt !== null && Number.isFinite(relationshipStartedAt.getTime()) && relationshipStartedAt.getTime() <= Date.now();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  function handleThemeChange(themeId: keyof typeof albumWallThemes) {
    setThemeError(false);
    void albums.setTheme(themeId).catch(() => setThemeError(true));
  }

  return (
    <AppShell theme={albums.selected ? theme.id : undefined}>
      <main className={`album-wall ${theme.className} ${theme.modern ? 'album-wall--modern' : ''}`} style={theme.modern ? { '--theme-scene': theme.background ? `url("${theme.background}")` : 'none', '--theme-accent': theme.accent } as CSSProperties : undefined}>
        <header className="gallery-command-bar">
          <div className="album-wall__identity">
            <h1>我们的故事</h1>
          </div>
        <div className="album-wall__toolbar">
        {albums.years.length > 0 ? (
          <AlbumYearPicker
            onSelect={albums.selectYear}
            selectedYear={albums.selectedYear}
            years={albums.years}
          />
        ) : null}
        {albums.selected ? (
          <AlbumWallThemePicker onChange={handleThemeChange} value={selectedThemeId} />
        ) : null}
        {albums.selected ? <button className="album-wall__create" type="button" onClick={() => setEditor('create')}>新建相册</button> : null}
        </div>
        <details className="page-tools-more" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
          <summary>更多</summary>
          <div className="page-tools-more__panel">
            {validStart ? <RelationshipTimer startedAt={relationshipStartedAt!} /> : <p>设置纪念日后，在这里记录我们的时间</p>}
            <p className="story-music-note">音乐功能尚未接入</p>
            <button className="album-wall__account" disabled={signingOut} onClick={handleSignOut} type="button">
              {signingOut ? '正在退出…' : `${user?.displayName ?? '我们'} · 退出`}
            </button>
          </div>
        </details>
        </header>
        {themeError ? <p className="album-wall__theme-error" role="status">主题没有保存成功，已恢复原来的样子。</p> : null}

        {albums.status === 'loading' ? (
          <section className="album-wall-state" aria-live="polite">正在打开我们的故事…</section>
        ) : null}
        {albums.status === 'error' ? (
          <section className="album-wall-state" role="alert">
            <h1>相册暂时没有打开</h1>
            <p>可能只是网络打了个盹，你们的回忆还好好地在这里。</p>
            <button onClick={() => void albums.reload()} type="button">再试一次</button>
          </section>
        ) : null}
        {albums.status === 'ready' && albums.years.length === 0 ? (
          <AlbumWallEmptyState onCreate={() => setEditor('create')} />
        ) : null}
        {albums.status === 'ready' && albums.selected ? (
          <AlbumCorridor
            compactHeader
            autoPlay={!editor}
            focusAlbumId={focusAlbumId}
            onCreate={() => setEditor('create')}
            onEdit={setEditor}
            year={albums.selected}
          />
        ) : null}

        {editor === 'create' ? (
          <AlbumEditorDialog
            initialDate={todayInLocalTime()}
            mode="create"
            onClose={() => setEditor(null)}
            onSubmit={async (input) => {
              const created = await albums.create(input);
              setFocusAlbumId(created.id);
            }}
          />
        ) : null}
        {editor && editor !== 'create' ? (
          <AlbumEditorDialog
            album={editor}
            mode="edit"
            onClose={() => setEditor(null)}
            onSubmit={async (input) => {
              const updated = await albums.update(editor.id, input);
              setFocusAlbumId(updated.id);
            }}
          />
        ) : null}
      </main>
    </AppShell>
  );
}
