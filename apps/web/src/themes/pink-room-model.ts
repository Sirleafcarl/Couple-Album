import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BAY_WIDTH, pinkGalleryLayout } from './pink-gallery-layout.js';

/** Architectural geometry, not a room image. Shared geometry keeps the long wall light. */
export function buildPinkRoom(count: number) {
  const layout = pinkGalleryLayout(count), room = new THREE.Group(), frames: THREE.Group[] = [];
  const cream = new THREE.MeshStandardMaterial({ color: '#fff0dd', roughness: .48 });
  const wall = new THREE.MeshStandardMaterial({ color: '#edc5c0', roughness: .9 });
  const inset = new THREE.MeshStandardMaterial({ color: '#e3b6af', roughness: .95 });
  const pink = new THREE.MeshStandardMaterial({ color: '#d787a4', roughness: .52 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d3ae79', metalness: .55, roughness: .4 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.8, 1.6), toneMapped: false });
  const cache = new Map<string, THREE.BufferGeometry>();
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D, x: number, y: number, z: number, name = '') {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.name = name;
    o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
  }
  function box(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, name = '', radius = .05) {
    const key = `${w}/${h}/${d}/${radius}`;
    let g = cache.get(key);
    if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)); cache.set(key, g); }
    return mesh(g, m, p, x, y, z, name);
  }
  const sphere = new THREE.SphereGeometry(1, 20, 12);
  function orb(p: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, m: THREE.Material) {
    const o = mesh(sphere, m, p, x, y, z); o.scale.set(sx, sy, sz); return o;
  }
  function bow(p: THREE.Object3D, x: number, y: number, z: number, scale: number, m = pink) {
    for (const side of [-1, 1]) {
      const o = orb(p, x + side * .16 * scale, y, z, .19 * scale, .12 * scale, .075 * scale, m); o.rotation.z = side * .4;
      const tail = box(p, x + side * .1 * scale, y - .18 * scale, z, .1 * scale, .27 * scale, .04, m); tail.rotation.z = side * .3;
    }
    orb(p, x, y, z + .025, .075 * scale, .09 * scale, .08 * scale, m);
  }
  const center = (layout.bays - 1) * BAY_WIDTH / 2;
  box(room, center, -.13, 2.2, layout.width + 10, .26, 10, cream, 'floor');
  box(room, center, 4.2, -.45, layout.width + 5, 8.4, .5, wall, 'back-wall');
  const shape = new THREE.Shape(); shape.moveTo(-2.05, .5); shape.lineTo(2.05, .5); shape.lineTo(2.05, 5.25);
  shape.absarc(0, 5.25, 2.05, 0, Math.PI, false); shape.lineTo(-2.05, .5);
  const niche = new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false, curveSegments: 40 });
  // Room-local ownership: every bay reuses these shapes; room teardown disposes
  // unique geometries once, without invalidating another mounted scene.
  const archGeometries = new Map<string, THREE.TubeGeometry>();
  function archLine(radius: number, z: number, material: THREE.Material, parent: THREE.Object3D, thickness: number) {
    const key = `${radius}/${z}/${thickness}`;
    const shared = archGeometries.get(key);
    if (shared) { mesh(shared, material, parent, 0, 0, 0); return; }
    const points = [new THREE.Vector3(-radius, .5, z), new THREE.Vector3(-radius, 5.25, z)];
    for (let n = 0; n <= 48; n++) { const a = Math.PI - n / 48 * Math.PI; points.push(new THREE.Vector3(Math.cos(a) * radius, 5.25 + Math.sin(a) * radius, z)); }
    points.push(new THREE.Vector3(radius, .5, z));
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(points[i - 1]!, points[i]!));
    const geometry = new THREE.TubeGeometry(curve, 100, thickness, 8, false);
    archGeometries.set(key, geometry);
    mesh(geometry, material, parent, 0, 0, 0);
  }
  for (let bay = 0; bay < layout.bays; bay++) {
    const group = new THREE.Group(); group.name = `arch-${bay}`; group.position.x = bay * BAY_WIDTH; room.add(group);
    mesh(niche, inset, group, 0, 0, -.12);
    archLine(2.16, .05, cream, group, .065); archLine(2.06, .08, glow, group, .018);
    archLine(2.25, -.01, wall, group, .045);
    bow(group, 0, 6.94, .12, .8, gold);
    for (const x of [-2.27, 2.27]) {
      box(group, x, 2.82, .1, .18, 4.74, .24, cream);
      box(group, x, .5, .15, .36, .36, .4, cream);
      box(group, x, 5.22, .14, .36, .18, .37, cream);
    }
    box(group, 0, .36, .03, BAY_WIDTH, .15, .3, cream);
    box(group, 0, .17, .05, BAY_WIDTH, .13, .4, wall);
  }
  for (const slot of layout.slots) {
    const frame = new THREE.Group(); frame.name = `album-${slot.index}`; frame.userData.albumIndex = slot.index;
    frame.userData.slot = slot; frame.position.set(slot.x, slot.y, .22);
    box(frame, 0, 0, 0, slot.width, slot.height, .2, gold, 'frame-back', .1);
    box(frame, 0, 0, .08, slot.width - .035, slot.height - .035, .15, cream, 'frame-rim', .1);
    box(frame, 0, 0, .17, slot.width - .17, slot.height - .17, .07, wall, 'frame-inner', .06);
    const photo = mesh(new THREE.PlaneGeometry(slot.width - .28, slot.height - .28), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), frame, 0, 0, .24, 'photo');
    photo.userData.albumIndex = slot.index;
    box(frame, 0, -slot.height / 2 - .21, .09, Math.min(slot.width, 1.85), .42, .13, cream, 'plaque', .1);
    if (slot.index % 3 !== 1) bow(frame, slot.width / 2 - .18, slot.height / 2 - .035, .27, .72);
    room.add(frame); frames.push(frame);
  }
  // Peripheral props frame the collection instead of occupying its center.
  const curtains = new THREE.Group(); curtains.name = 'curtains'; room.add(curtains);
  for (let i = 0; i < 10; i++) {
    const c = mesh(new THREE.CylinderGeometry(.075, .1, 7.7, 12), i % 2 ? cream : wall, curtains, -2.9 - i * .13, 3.9, .25 + Math.sin(i) * .05); c.castShadow = false;
  }
  box(room, -3.3, .59, 2.3, 2.2, .48, 1.2, pink, 'bench', .2);
  for (const x of [-4.1, -2.5]) box(room, x, .25, 2.3, .08, .5, .7, gold);
  const vaseX = (layout.bays - 1) * BAY_WIDTH + 2.3;
  mesh(new THREE.CylinderGeometry(.48, .5, 1.1, 32), cream, room, vaseX, .55, 1.05, 'plinth');
  orb(room, vaseX, 1.47, 1.05, .25, .38, .25, cream);
  for (let i = 0; i < 5; i++) {
    const x = vaseX + (i - 2) * .08, stem = box(room, x, 2, 1.05, .012, .75 + (i % 2) * .3, .012, gold); stem.rotation.z = (i - 2) * .17;
    orb(room, x + (2 - i) * .05, 2.38 + (i % 2) * .15, 1.05, .065, .065, .055, i % 2 ? pink : cream);
  }
  return { room, frames, layout };
}
