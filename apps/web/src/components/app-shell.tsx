import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { isKittyTheme, useRoomTheme } from '../themes/room-theme.js';
import { albumWallThemes } from '../album-wall/album-wall-themes.js';
import type { AlbumWallThemeId } from '../album-wall/album-wall-types.js';
import { InstallGuide } from '../pwa/pwa-experience.js';

const destinations = [
  { to: '/', label: '相册廊', path: 'M4 5h16v14H4z M8 5v14 M12 9h5 M12 13h3' },
  { to: '/library', label: '照片库', path: 'M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M15 8h.01' },
  { to: '/trash', label: '回收站', path: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5' },
] as const;

function SpineLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <>{destinations.map(({ to, label, path }) => (
    <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate} title={label}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
      <span>{label}</span>
    </NavLink>
  ))}</>;
}

export function AppShell({ children, theme }: { children: ReactNode; theme?: string | undefined }) {
  const { roomTheme, selectRoomTheme } = useRoomTheme();
  const selected = theme ?? roomTheme;
  const kitty = isKittyTheme(selected) ? selected : undefined;
  const effectiveTheme = selected && albumWallThemes[selected as AlbumWallThemeId]?.modern ? selected : undefined;
  useEffect(() => { if (theme !== undefined) selectRoomTheme(theme); }, [theme, selectRoomTheme]);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const [open, setOpen] = useState(false);

  function closeDrawer() { drawerRef.current?.close(); }
  function finishClose() { setOpen(false); openerRef.current?.focus(); }

  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 1200px)');
    const resize = () => { if (desktop?.matches && drawerRef.current?.open) drawerRef.current.close(); };
    desktop?.addEventListener('change', resize);
    return () => desktop?.removeEventListener('change', resize);
  }, []);

  return (
    <div className="app-shell" data-theme={effectiveTheme} data-kitty-theme={kitty}>
      <a className="story-skip" href="#story-content">跳到内容</a>
      <aside className="story-spine">
        <NavLink className="story-brand" to="/" aria-label="我们的故事">
          <span className="story-brand__mark" aria-hidden="true">{kitty ? <img src={`/themes/${kitty}/character.webp`} alt="" /> : 'm.'}</span>
          <span className="story-brand__name">我们的故事<small>ONLY US, ALWAYS</small></span>
        </NavLink>
        <p className="story-spine__chapter">珍藏 · 日常 · 我们</p>
        <nav aria-label="主要导航"><SpineLinks /></nav>
        <InstallGuide />
        <div className="story-spine__foot"><span aria-hidden="true" /><p>{kitty === 'kitty-dream' ? <>小小的日常<br />也是大大的幸福</> : <>把平常的日子<br />慢慢写成以后。</>}</p><small>PRIVATE MEMORIES</small></div>
      </aside>
      <button ref={openerRef} className="story-nav-toggle" type="button" aria-label="打开导航" aria-controls={drawerId} aria-expanded={open}
        onClick={() => { drawerRef.current?.showModal(); setOpen(true); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 7h14M5 12h10M5 17h14" /></svg>
      </button>
      <dialog ref={drawerRef} id={drawerId} className="story-drawer" aria-label="主要导航" onClose={finishClose}
        onCancel={(event) => { event.preventDefault(); closeDrawer(); }}>
        <div className="story-drawer__heading"><strong>我们的故事</strong><button type="button" onClick={closeDrawer} aria-label="关闭导航">关闭</button></div>
        <p>沿着红线，回到我们的日常。</p>
        <nav aria-label="展开的主要导航"><SpineLinks onNavigate={closeDrawer} /></nav>
        <InstallGuide />
      </dialog>
      <div className="story-content" id="story-content" tabIndex={-1}>{children}</div>
    </div>
  );
}
