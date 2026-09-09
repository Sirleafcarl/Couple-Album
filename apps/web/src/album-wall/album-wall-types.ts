import type { AlbumSummary, AlbumThemeId, AlbumYear } from '@memory/contracts/albums';

export type AlbumWallThemeId = AlbumThemeId;
export type AlbumWallItem = AlbumSummary;
export type AlbumWallYear = AlbumYear;

export interface AlbumWallTheme {
  id: AlbumWallThemeId;
  label: string;
  scene: string;
  className: string;
  modern?: boolean;
  layout?: 'editorial' | 'collage' | 'orbit' | 'pop' | 'gallery' | 'hanging' | 'track' | 'arc';
  background?: string;
  accent?: string;
  description?: string;
}
