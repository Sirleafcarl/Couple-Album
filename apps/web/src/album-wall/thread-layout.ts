export interface AlbumAnchor {
  x: number;
  threadY: number;
  connectorX: number;
  connectorY: number;
  side: 'above' | 'below';
}

export function layoutAlbumAnchors(count: number, width: number): AlbumAnchor[] {
  if (count <= 0) return [];

  const gap = Math.max(320, (width - 240) / Math.max(1, count - 1));
  return Array.from({ length: count }, (_, index) => {
    const x = 120 + index * gap;
    const threadY = 310 + Math.sin(index * 1.35) * 56;
    return {
      x,
      threadY,
      connectorX: x,
      connectorY: threadY,
      side: index % 2 === 0 ? 'above' : 'below',
    };
  });
}

export function buildThreadPath(anchors: AlbumAnchor[]): string {
  if (anchors.length === 0) return '';

  return anchors.reduce((path, anchor, index) => {
    if (index === 0) return `M ${anchor.x} ${anchor.threadY}`;
    const previous = anchors[index - 1]!;
    const midpoint = (previous.x + anchor.x) / 2;
    return `${path} C ${midpoint} ${previous.threadY}, ${midpoint} ${anchor.threadY}, ${anchor.x} ${anchor.threadY}`;
  }, '');
}
