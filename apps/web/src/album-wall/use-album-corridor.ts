import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceCorridor } from './corridor-metrics.js';

interface AlbumCorridorOptions {
  enabled: boolean;
  speed: number;
  contentWidth?: number;
}

export function useAlbumCorridor({ enabled, speed, contentWidth }: AlbumCorridorOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(!enabled);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerHeld = useRef(false);
  const pause = useCallback(() => {
    setPaused(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!pointerHeld.current && enabled && !reducedMotion) setPaused(false);
    }, 5000);
  }, [enabled, reducedMotion]);
  const resume = useCallback(() => {
    if (enabled && !reducedMotion) setPaused(false);
  }, [enabled, reducedMotion]);

  useEffect(() => {
    setPaused(!enabled);
    const down = () => { pointerHeld.current = true; pause(); };
    const up = () => { pointerHeld.current = false; pause(); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('wheel', pause, { passive: true });
    document.addEventListener('touchmove', pause, { passive: true });
    document.addEventListener('keydown', pause);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      pointerHeld.current = false;
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.removeEventListener('wheel', pause);
      document.removeEventListener('touchmove', pause);
      document.removeEventListener('keydown', pause);
    };
  }, [enabled, pause]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const motion = () => { setReducedMotion(query?.matches ?? false); if (query?.matches) pause(); };
    const visibility = () => setHidden(document.visibilityState === 'hidden');
    query?.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => { query?.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, [pause]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      setViewportWidth(viewport.clientWidth);
      setOverflowing(viewport.scrollWidth > viewport.clientWidth + 1);
      setAtEnd(viewport.scrollWidth > viewport.clientWidth + 1 && viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 1);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    viewport.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => { observer?.disconnect(); viewport.removeEventListener('scroll', measure); };
  }, [contentWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !enabled || paused || reducedMotion || hidden || !overflowing || atEnd) return;

    let frame = 0;
    let previous = performance.now();
    let position = viewport.scrollLeft;
    let lastAssigned = viewport.scrollLeft;
    const stopForExternalScroll = () => {
      if (Math.abs(viewport.scrollLeft - lastAssigned) > 1) {
        window.cancelAnimationFrame(frame);
        pause();
      }
    };
    viewport.addEventListener('scroll', stopForExternalScroll, { passive: true });
    const tick = (now: number) => {
      const max = viewport.scrollWidth - viewport.clientWidth;
      position = advanceCorridor(position, max, now - previous, speed);
      viewport.scrollLeft = position;
      lastAssigned = viewport.scrollLeft;
      if (viewport.scrollLeft >= max - 1) { setAtEnd(true); setPaused(true); return; }
      previous = now;
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(frame); viewport.removeEventListener('scroll', stopForExternalScroll); };
  }, [enabled, paused, speed, reducedMotion, hidden, overflowing, atEnd, pause]);

  return { viewportRef, viewportWidth, paused: paused || reducedMotion, pause, resume, overflowing, atEnd, reducedMotion };
}
