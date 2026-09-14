import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AlbumWallItem } from '../album-wall/album-wall-types.js';
import PinkRoom from '../themes/pink-room.js';

const gpu = vi.hoisted(() => ({ draw: vi.fn(), loop: null as null | ((now: number) => void), loaded: null as null | ((texture: unknown) => void) }));
vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>();
  return { ...three, WebGLRenderer: class {
    domElement = document.createElement('canvas'); shadowMap = {}; setDrawingBufferSize() {} dispose() {}
    setAnimationLoop(loop: typeof gpu.loop) { gpu.loop = loop; }
    render = gpu.draw;
  }, TextureLoader: class {
    load(_url: string, loaded: (texture: unknown) => void) { gpu.loaded = loaded; return new three.Texture(); }
  } };
});
vi.mock('../themes/pink-gallery-textures.js', async () => {
  const { Texture } = await import('three');
  return { albumCanvasTexture: () => new Texture(), fitAlbumTexture: vi.fn() };
});
const albums = [{ id: 'one', title: '回忆', occurredOn: '2026-09-10', coverUrl: '/preview.jpg' }] as AlbumWallItem[];
const props = { albums, height: 600, focusRevision: 0, active: true, autoPlay: false, onOpen: vi.fn() };
let now = 0;
function frames(count: number) { act(() => { for (let i = 0; i < count; i++) gpu.loop?.(now += 16.67); }); }
beforeEach(() => {
  now = performance.now(); gpu.draw.mockClear(); gpu.loaded = null;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('draws once when idle, but redraws when preview loads or viewport changes', async () => {
  render(<PinkRoom {...props} />);
  frames(60);
  expect(gpu.draw).toHaveBeenCalledTimes(1);
  const { Texture } = await import('three'); const texture = new Texture(); texture.image = { width: 100, height: 100 };
  act(() => gpu.loaded?.(texture)); frames(1);
  expect(gpu.draw).toHaveBeenCalledTimes(2);
  act(() => window.dispatchEvent(new Event('resize'))); frames(1);
  expect(gpu.draw).toHaveBeenCalledTimes(3);
  frames(60); expect(gpu.draw).toHaveBeenCalledTimes(3);
});

it('continues drawing during focus motion and stops after settling', () => {
  const view = render(<PinkRoom {...props} />); frames(1);
  view.rerender(<PinkRoom {...props} focusAlbumId="one" focusRevision={1} />);
  frames(10); expect(gpu.draw.mock.calls.length).toBeGreaterThan(1);
  frames(180); const settled = gpu.draw.mock.calls.length;
  frames(60); expect(gpu.draw).toHaveBeenCalledTimes(settled);
});

it('keeps auto-roaming alive and draws nothing while document is hidden', () => {
  render(<PinkRoom {...props} autoPlay />);
  now += 6000; frames(20); expect(gpu.draw.mock.calls.length).toBeGreaterThan(1);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const before = gpu.draw.mock.calls.length; frames(20);
  expect(gpu.draw).toHaveBeenCalledTimes(before);
});

it('processes a bounded frame window and releases old textures after a long focus jump', () => {
  const many = Array.from({ length: 300 }, (_, index) => ({ ...albums[0]!, id: `album-${index}`, coverUrl: null }));
  const view = render(<PinkRoom {...props} albums={many} />); frames(1);
  const scene = gpu.draw.mock.calls.at(-1)![0] as import('three').Scene;
  const first = scene.getObjectByName('album-0')!.getObjectByName('photo') as import('three').Mesh<import('three').PlaneGeometry, import('three').MeshBasicMaterial>;
  const oldTexture = first.material.map!;
  const dispose = vi.spyOn(oldTexture, 'dispose');
  let frameReads = 0;
  for (let i = 0; i < many.length; i++) {
    const position = scene.getObjectByName(`album-${i}`)!.position;
    const x = position.x;
    Object.defineProperty(position, 'x', { configurable: true, get() { frameReads++; return x; } });
  }
  act(() => window.dispatchEvent(new Event('resize'))); frames(1);
  expect(frameReads).toBeLessThan(40);
  view.rerender(<PinkRoom {...props} albums={many} focusAlbumId="album-299" focusRevision={1} />);
  frames(200);
  expect(dispose).toHaveBeenCalledOnce();
  expect(first.material.map).toBeNull();
  const last = scene.getObjectByName('album-299')!.getObjectByName('photo') as typeof first;
  expect(last.material.map).not.toBeNull();
});
