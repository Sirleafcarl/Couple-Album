import { describe, expect, it } from 'vitest';
import { Box3, Mesh, TubeGeometry } from 'three';
import { buildPinkRoom } from '../themes/pink-room-model.js';

describe('pink spatial room', () => {
  it('shares three arch geometries across bays without sharing resources between rooms', () => {
    const first = buildPinkRoom(90), second = buildPinkRoom(9);
    const tubes = (room: typeof first.room) => {
      const result: TubeGeometry[] = [];
      room.traverse(object => { if (object instanceof Mesh && object.geometry instanceof TubeGeometry) result.push(object.geometry); });
      return result;
    };
    const geometries = tubes(first.room);
    expect(geometries).toHaveLength(90);
    expect(new Set(geometries).size).toBe(3);
    expect(geometries[0]).toBe(geometries[3]);
    expect(geometries[0]).not.toBe(tubes(second.room)[0]);
    expect(geometries[0]!.parameters.tubularSegments).toBe(100);
    expect(geometries[0]!.parameters.radialSegments).toBe(8);
  });
  it.each([0, 1, 9, 20])('builds all %i albums without room pagination', count => {
    const { room, frames } = buildPinkRoom(count);
    expect(frames).toHaveLength(count);
    expect(room.getObjectByName('arch-0')).toBeDefined();
    expect(room.getObjectByName('kitty')).toBeUndefined();
    expect(room.getObjectByName('sofa')).toBeUndefined();
    frames.forEach((frame, index) => expect(frame.userData.albumIndex).toBe(index));
  });
  it('keeps the photo room furnished without the removed cat model', () => {
    const { room, frames } = buildPinkRoom(8);
    expect(room.getObjectByName('kitty')).toBeUndefined();
    for (const name of ['floor', 'back-wall', 'curtains', 'bench', 'arch-0']) expect(room.getObjectByName(name)).toBeDefined();
    expect(frames).toHaveLength(8);
    const bounds = new Box3().setFromObject(frames[0]!);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(.1);
  });
  it('has portrait and landscape frames with non-overlapping bounds', () => {
    const bounds = buildPinkRoom(9).frames.map(frame => new Box3().setFromObject(frame));
    expect(bounds.some(b => b.max.x - b.min.x > b.max.y - b.min.y)).toBe(true);
    expect(bounds.some(b => b.max.x - b.min.x < b.max.y - b.min.y)).toBe(true);
    bounds.forEach((box, index) => bounds.slice(index + 1).forEach(other => expect(box.intersectsBox(other)).toBe(false)));
  });
});
