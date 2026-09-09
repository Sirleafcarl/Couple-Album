import { albumWallThemes } from './album-wall-themes.js';
import type { AlbumWallThemeId } from './album-wall-types.js';
import { useEffect, useId, useRef, useState } from 'react';

interface AlbumWallThemePickerProps {
  value: AlbumWallThemeId;
  onChange: (themeId: AlbumWallThemeId) => void;
}

export function AlbumWallThemePicker({ value, onChange }: AlbumWallThemePickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return (
    <div ref={root} className="album-wall-theme-control" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>主题</button>
      {open ? <div id={id} aria-label="年度主题" className="album-wall-theme-picker" role="group">
      {Object.values(albumWallThemes).map((theme) => (
        <button
          aria-label={`切换到${theme.label}主题`}
          aria-pressed={value === theme.id}
          key={theme.id}
          onClick={() => { onChange(theme.id); setOpen(false); trigger.current?.focus(); }}
          type="button"
        >
          <span className="theme-choice__art" aria-hidden="true">{theme.background || !theme.modern ? <img alt="" src={`/themes/${theme.id}/${theme.modern ? 'thumb' : 'scene'}.webp`} /> : 'Aa'}</span>
          <span className="theme-choice__text"><strong>{theme.label}</strong><small>{theme.description || '经典红绳 · 微风摇曳'}</small></span>
        </button>
      ))}
      </div> : null}
    </div>
  );
}
