/** Match display density without allocating an unbounded high-DPI drawing buffer. */
export function pinkRenderPixelRatio(width: number, height: number, devicePixelRatio: number) {
  return Math.min(devicePixelRatio, 3, Math.sqrt(8_000_000 / (Math.max(1, width) * Math.max(1, height))));
}
