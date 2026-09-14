export const BAY_WIDTH = 4.6;
const SLOT_OFFSET = .96;

/** Conservative bay window, including the two side-offset frames in each bay. */
export function nearbyFrameIndices(count: number, x: number, radius: number): number[] {
  const first = Math.max(0, Math.floor((x - radius - SLOT_OFFSET) / BAY_WIDTH) * 3);
  const end = Math.min(count, (Math.floor((x + radius + SLOT_OFFSET) / BAY_WIDTH) + 1) * 3);
  return Array.from({ length: Math.max(0, end - first) }, (_, index) => first + index);
}

/** Continuous world coordinates; no page boundary, including the ninth album. */
export function pinkGalleryLayout(count: number) {
  const bays = Math.max(3, Math.ceil(count / 3));
  const slots = Array.from({ length: count }, (_, index) => {
    const bay = Math.floor(index / 3), local = index % 3;
    const wide = bay % 2 === 0 ? local === 0 : local === 2;
    const x = bay * BAY_WIDTH + (wide ? 0 : (local === (bay % 2 === 0 ? 1 : 0) ? -SLOT_OFFSET : SLOT_OFFSET));
    const y = bay % 2 === 0 ? (wide ? 4.92 : 2.18) : (wide ? 2.18 : 4.92);
    return { index, bay, x, y, width: wide ? 3.35 : 1.57, height: 2.12 };
  });
  return { bays, width: bays * BAY_WIDTH, slots };
}

export function galleryCameraBounds(count: number, aspect: number) {
  const { bays } = pinkGalleryLayout(count);
  const visibleWidth = Math.min(16.6, 9.1 * Math.max(.35, aspect));
  const first = Math.min((bays - 1) * BAY_WIDTH / 2, Math.max(0, visibleWidth / 2 - BAY_WIDTH / 2 - .65));
  const last = Math.max(first, (bays - 1) * BAY_WIDTH - first);
  return { first, last, visibleWidth, height: visibleWidth / Math.max(.35, aspect) };
}
