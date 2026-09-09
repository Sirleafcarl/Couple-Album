import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAlbumCorridor } from '../album-wall/use-album-corridor.js';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('resumes five seconds after the last interaction, but not while a pointer is held', () => {
  vi.useFakeTimers();
  function Harness() {
    const motion = useAlbumCorridor({ enabled: true, speed: 12 });
    return <div ref={motion.viewportRef} data-testid="state">{motion.paused ? 'paused' : 'running'}</div>;
  }
  render(<Harness />);
  fireEvent.wheel(document);
  expect(screen.getByTestId('state')).toHaveTextContent('paused');
  act(() => vi.advanceTimersByTime(4000));
  fireEvent.wheel(document);
  act(() => vi.advanceTimersByTime(4999));
  expect(screen.getByTestId('state')).toHaveTextContent('paused');
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByTestId('state')).toHaveTextContent('running');
  fireEvent.pointerDown(document);
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.getByTestId('state')).toHaveTextContent('paused');
  fireEvent.pointerUp(document);
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByTestId('state')).toHaveTextContent('running');
});

it('accumulates subpixel motion even when the browser rounds scrollLeft', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  function Harness() {
    const motion = useAlbumCorridor({ enabled: true, speed: 12, contentWidth: 1200 });
    return <div ref={(node) => {
      if (node && !Object.hasOwn(node, 'clientWidth')) {
        Object.defineProperty(node, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(node, 'scrollWidth', { configurable: true, value: 1200 });
        let value = 0;
        Object.defineProperty(node, 'scrollLeft', { configurable: true, get: () => value, set: (left: number) => { value = Math.round(left); } });
      }
      motion.viewportRef.current = node;
    }} data-testid="viewport" />;
  }
  render(<Harness />);
  for (let time = 16; time <= 160; time += 16) {
    act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(time)); });
  }
  expect(screen.getByTestId('viewport').scrollLeft).toBeGreaterThanOrEqual(1);
  const viewport = screen.getByTestId('viewport');
  viewport.scrollLeft = 100;
  fireEvent.scroll(viewport);
  act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(176)); });
  expect(viewport.scrollLeft).toBe(100);
});
