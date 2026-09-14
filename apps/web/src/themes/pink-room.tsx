import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { AlbumWallItem } from '../album-wall/album-wall-types.js';
import { buildPinkRoom } from './pink-room-model.js';
import { galleryCameraBounds, nearbyFrameIndices } from './pink-gallery-layout.js';
import { albumCanvasTexture, fitAlbumTexture } from './pink-gallery-textures.js';
import { pinkRenderPixelRatio } from './pink-render-resolution.js';
import './pink-room.css';

export default function PinkRoom({ albums, height, focusAlbumId, focusRevision, active, autoPlay, onOpen }: {
  albums: AlbumWallItem[]; height: number; focusAlbumId?: string | undefined; focusRevision: number; active: boolean; autoPlay: boolean;
  onOpen(album: AlbumWallItem, opener: HTMLButtonElement): void;
}) {
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null), sceneReturnButton = useRef<HTMLButtonElement>(null);
  const controls = useRef<{ focus(index: number): void; reset(): void } | null>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const autoPlayRef = useRef(autoPlay); autoPlayRef.current = autoPlay;
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const idleUntil = useRef(0);
  useEffect(() => { idleUntil.current = performance.now() + 5000; }, [active]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setFailed(true); return; }
    setFailed(false);
    let disposed = false;
    let dirty = true, frameSettling = false, previousHovered = -1;
    const invalidate = () => { dirty = true; };
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', '粉色回忆展廊，左右拖动浏览相册'); container.append(canvas);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#f1d6ce');
    const camera = new THREE.PerspectiveCamera(42, 1, .1, 1200);
    const { room, frames, layout } = buildPinkRoom(albums.length); scene.add(room);
    scene.add(new THREE.HemisphereLight('#fff8ee', '#dabec1', 1.8));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(-4, 8, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9; sun.shadow.normalBias = .035; sun.shadow.bias = -.0001; sun.shadow.radius = 4; sun.shadow.intensity = .5; scene.add(sun);
    const fill = new THREE.DirectionalLight('#ffdce4', .7); fill.position.set(8, 5, 7); scene.add(fill);
    const textures = new Set<THREE.Texture>(), loader = new THREE.TextureLoader();
    const loaded = new Set<number>();
    const frameResources = new Map<number, { active: boolean; textures: THREE.Texture[]; plaque: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> }>();
    const loadFrame = (index: number) => {
      if (loaded.has(index)) return; loaded.add(index);
      const album = albums[index]!, slot = layout.slots[index]!, frame = frames[index]!;
      const photo = frame.getObjectByName('photo') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
      const aspect = (slot.width - .28) / (slot.height - .28);
      const fallback = albumCanvasTexture(album, aspect); textures.add(fallback); photo.material.map = fallback; photo.material.needsUpdate = true;
      const label = albumCanvasTexture(album, 4, true); textures.add(label);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(slot.width, 1.85) - .09, .37), new THREE.MeshBasicMaterial({ map: label, toneMapped: false }));
      plaque.position.set(0, -slot.height / 2 - .21, .18); frame.add(plaque);
      const resource = { active: true, textures: [fallback, label] as THREE.Texture[], plaque }; frameResources.set(index, resource);
      if (album.coverUrl) {
        const texture = loader.load(album.coverUrl, value => {
          if (disposed || !resource.active) { value.dispose(); return; }
          fitAlbumTexture(value, aspect, value.image.width, value.image.height);
          photo.material.map = value; photo.material.color.set('#ffffff'); photo.material.needsUpdate = true;
          invalidate();
        }, undefined, () => { /* Keep the dated cover if the thumbnail is unavailable. */ });
        texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture); resource.textures.push(texture);
      }
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let bounds = galleryCameraBounds(albums.length, 1.8), targetX = bounds.first, currentX = targetX;
    let targetZoom = 1, zoom = 1, distance = 11, dragging = false, moved = false;
    let startX = 0, startY = 0, startTarget = 0, hovered = -1, autoDirection = 1;
    let pending: { index: number; at: number } | null = null;
    const pause = () => { idleUntil.current = performance.now() + 5000; };
    const clamp = (x: number) => THREE.MathUtils.clamp(x, bounds.first, bounds.last);
    const focus = (index: number) => {
      const slot = layout.slots[index]; if (!slot) return;
      pause(); targetX = THREE.MathUtils.clamp(slot.x, 0, (layout.bays - 1) * 4.6); targetZoom = 1.18;
      if (reduced.matches) { currentX = targetX; zoom = targetZoom; }
      invalidate();
    };
    controls.current = { focus, reset: () => { pause(); targetX = bounds.first; targetZoom = 1; pending = null; } };
    const resize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setDrawingBufferSize(w, h, pinkRenderPixelRatio(w, h, window.devicePixelRatio));
      camera.aspect = w / h; bounds = galleryCameraBounds(albums.length, camera.aspect);
      distance = Math.max(8.8, bounds.height) / (2 * Math.tan(THREE.MathUtils.degToRad(21)));
      targetX = clamp(targetX); currentX = clamp(currentX); camera.updateProjectionMatrix();
      invalidate();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    window.addEventListener('resize', resize);
    // A display-density change need not change the container's CSS dimensions.
    let densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const densityChanged = () => {
      densityQuery.removeEventListener('change', densityChanged); resize();
      densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      densityQuery.addEventListener('change', densityChanged);
    };
    densityQuery.addEventListener('change', densityChanged);
    targetX = bounds.first; currentX = targetX;
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const hitIndex = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(pointer, camera);
      let object: THREE.Object3D | null = ray.intersectObjects(frames, true)[0]?.object ?? null;
      while (object && object.userData.albumIndex === undefined) object = object.parent;
      return typeof object?.userData.albumIndex === 'number' ? object.userData.albumIndex as number : -1;
    };
    const down = (event: PointerEvent) => {
      if (!activeRef.current || event.button !== 0) return;
      pause(); pending = null; startX = event.clientX; startY = event.clientY; startTarget = targetX; dragging = true; moved = false;
      canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
    };
    const move = (event: PointerEvent) => {
      if (!activeRef.current) return;
      if (dragging) {
        moved ||= Math.hypot(event.clientX - startX, event.clientY - startY) > 6;
        if (moved) { pause(); targetZoom = 1; targetX = clamp(startTarget - (event.clientX - startX) / container.clientWidth * bounds.visibleWidth); }
      } else { hovered = hitIndex(event); canvas.style.cursor = hovered >= 0 ? 'pointer' : 'grab'; }
    };
    const up = (event: PointerEvent) => {
      const wasDragging = dragging; dragging = false; pause(); canvas.style.cursor = 'grab';
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!wasDragging || moved || !activeRef.current) return;
      const index = hitIndex(event);
      if (index >= 0) { focus(index); pending = { index, at: performance.now() + (reduced.matches ? 0 : 320) }; }
    };
    const cancel = () => { dragging = false; pending = null; pause(); };
    const leave = () => { hovered = -1; };
    const wheel = (event: WheelEvent) => {
      if (!activeRef.current || event.ctrlKey) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const next = clamp(targetX + delta * (event.deltaMode === 1 ? .16 : .012));
      pause(); pending = null;
      if (next !== targetX) { event.preventDefault(); targetX = next; targetZoom = 1; }
    };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('pointerleave', leave); canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointerdown', pause); window.addEventListener('wheel', pause, { passive: true }); window.addEventListener('keydown', pause);
    document.addEventListener('visibilitychange', invalidate);
    // Snap imperceptible tails to the target so easing can become truly idle.
    const approach = (value: number, target: number, smoothing: number) => Math.abs(target - value) < .0001 ? target : value + (target - value) * smoothing;
    let previous = performance.now();
    renderer.setAnimationLoop(now => {
      const delta = Math.min((now - previous) / 1000, .05); previous = now;
      if (document.hidden) return;
      if (activeRef.current && autoPlayRef.current && !dragging && !pending && !reduced.matches && now > idleUntil.current) {
        targetZoom = 1; targetX = clamp(targetX + delta * .16 * autoDirection);
        if (targetX >= bounds.last) autoDirection = -1; else if (targetX <= bounds.first) autoDirection = 1;
      }
      const effectiveHovered = activeRef.current ? hovered : -1;
      if (dirty || currentX !== targetX || zoom !== targetZoom || frameSettling || effectiveHovered !== previousHovered) {
        dirty = false; frameSettling = false;
        const smoothing = reduced.matches ? 1 : 1 - Math.exp(-delta * 8);
        currentX = approach(currentX, targetX, smoothing); zoom = approach(zoom, targetZoom, smoothing);
        camera.position.set(currentX, 3.95, distance / zoom); camera.lookAt(currentX, 3.35, 0);
        sun.position.x = currentX - 4; sun.target.position.set(currentX, 3, 0); sun.target.updateMatrixWorld();
        // Include previously loaded frames once more so distant textures are freed.
        // Keep hover transitions even when a focus jump crosses the window boundary.
        const candidates = new Set([...nearbyFrameIndices(frames.length, currentX, bounds.visibleWidth / 2 + 10), ...frameResources.keys(), previousHovered, effectiveHovered]);
        previousHovered = effectiveHovered;
        for (const index of candidates) {
          const frame = frames[index]; if (!frame) continue;
          const separation = Math.abs(frame.position.x - currentX);
          if (separation < bounds.visibleWidth / 2 + 5) loadFrame(index);
          else if (separation > bounds.visibleWidth / 2 + 10) {
            const resource = frameResources.get(index);
            if (resource) {
              resource.active = false; resource.textures.forEach(texture => { texture.dispose(); textures.delete(texture); });
              resource.plaque.removeFromParent(); resource.plaque.geometry.dispose(); resource.plaque.material.dispose();
              const photo = frame.getObjectByName('photo') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
              photo.material.map = null; photo.material.needsUpdate = true; frameResources.delete(index); loaded.delete(index);
            }
          }
          const targetZ = effectiveHovered === index ? .38 : .22;
          frame.position.z = separation > bounds.visibleWidth / 2 + 10 ? targetZ : approach(frame.position.z, targetZ, smoothing);
          frameSettling ||= frame.position.z !== targetZ;
        }
        renderer.render(scene, camera);
      }
      if (pending && activeRef.current && now >= pending.at && sceneReturnButton.current) {
        const album = albums[pending.index]; pending = null;
        if (album) onOpenRef.current(album, sceneReturnButton.current);
      }
    });
    const lost = (event: Event) => { event.preventDefault(); pending = null; setFailed(true); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      disposed = true; controls.current = null; renderer.setAnimationLoop(null); observer.disconnect();
      window.removeEventListener('resize', resize); densityQuery.removeEventListener('change', densityChanged);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('webglcontextlost', lost);
      window.removeEventListener('pointerdown', pause); window.removeEventListener('wheel', pause); window.removeEventListener('keydown', pause);
      document.removeEventListener('visibilitychange', invalidate);
      textures.forEach(texture => texture.dispose());
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); } });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); sun.shadow.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [albums]);
  useEffect(() => { const index = albums.findIndex(album => album.id === focusAlbumId); if (index >= 0) controls.current?.focus(index); }, [albums, focusAlbumId, focusRevision]);
  return <div className="pink-room" style={{ height }}>
    <div className="pink-room__canvas" ref={host} hidden={failed} />
    <button className="pink-room__reset" ref={sceneReturnButton} type="button" onClick={() => controls.current?.reset()}>重置视角</button>
    {failed ? <p className="pink-room__status" role="status">当前设备无法显示 3D 展廊，可通过下方列表打开相册。</p> : <p className="pink-room__hint">横向拖动浏览 · 点击相册靠近</p>}
    <div className={`pink-room__albums${failed ? ' pink-room__albums--fallback' : ''}`} aria-label="展廊全部相册">
      {albums.map((album, index) => <button type="button" key={album.id} onFocus={() => controls.current?.focus(index)} onClick={event => onOpen(album, event.currentTarget)}>{album.title} · {album.occurredOn}</button>)}
      {!albums.length ? <p>展廊准备好了，等待我们的第一本相册。</p> : null}
    </div>
  </div>;
}
