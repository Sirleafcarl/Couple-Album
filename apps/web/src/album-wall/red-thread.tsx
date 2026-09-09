import { buildThreadPath, type AlbumAnchor } from './thread-layout.js';

interface RedThreadProps {
  anchors: AlbumAnchor[];
  width: number;
  height: number;
}

export function RedThread({ anchors, width, height }: RedThreadProps) {
  const first = anchors[0];
  const last = anchors.at(-1);
  const points = first && last ? [
    { ...first, x: 0, threadY: first.threadY + 18 },
    ...anchors,
    { ...last, x: width, threadY: last.threadY - 18 },
  ] : [];
  return (
    <svg
      aria-hidden="true"
      className="red-thread"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <path className="red-thread__shadow" d={buildThreadPath(points)} />
      <path className="red-thread__line" d={buildThreadPath(points)} />
    </svg>
  );
}
