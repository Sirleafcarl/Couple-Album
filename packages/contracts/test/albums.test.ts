import { describe, expect, it } from 'vitest';
import {
  AlbumListResponseSchema,
  CreateAlbumInputSchema,
  UpdateAlbumInputSchema,
  UpdateAlbumThemeInputSchema,
} from '../src/albums.js';

const albumId = '019cfff0-3e23-7d99-a3df-eabc920fd499';
const userId = '019cfff0-3e23-7d99-a3df-eabc920fd498';

describe('album contracts', () => {
  it('trims valid creation input and supplies an empty description', () => {
    expect(CreateAlbumInputSchema.parse({
      title: '  春日野餐记  ',
      occurredOn: '2026-03-28',
    })).toEqual({
      title: '春日野餐记',
      description: '',
      occurredOn: '2026-03-28',
    });
  });

  it('rejects impossible calendar dates and undeclared creator fields', () => {
    expect(CreateAlbumInputSchema.safeParse({
      title: '无效日期',
      description: '',
      occurredOn: '2026-02-30',
    }).success).toBe(false);
    expect(CreateAlbumInputSchema.safeParse({
      title: '伪造创建者',
      description: '',
      occurredOn: '2026-03-28',
      createdBy: userId,
    }).success).toBe(false);
  });

  it('requires at least one editable field in addition to the album version', () => {
    expect(UpdateAlbumInputSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(UpdateAlbumInputSchema.parse({ version: 1, title: '  新名字  ' })).toEqual({
      version: 1,
      title: '新名字',
    });
  });

  it('accepts only persisted themes and nullable first-write versions', () => {
    expect(UpdateAlbumThemeInputSchema.parse({
      themeId: 'love-letters',
      version: null,
    })).toEqual({ themeId: 'love-letters', version: null });
    expect(UpdateAlbumThemeInputSchema.safeParse({
      themeId: 'plain-red',
      version: null,
    }).success).toBe(false);
  });

  it('validates grouped public album output without storage paths', () => {
    const result = AlbumListResponseSchema.parse({
      years: [{
        year: 2026,
        themeId: 'secret-garden',
        themeVersion: null,
        albums: [{
          id: albumId,
          title: '春日野餐记',
          description: '风很轻。',
          occurredOn: '2026-03-28',
          year: 2026,
          month: 3,
          coverUrl: null,
          version: 1,
          createdBy: { id: userId, displayName: '小叶' },
        }],
      }],
    });

    expect(result.years[0]?.albums[0]?.title).toBe('春日野餐记');
    expect(AlbumListResponseSchema.safeParse({
      ...result,
      years: [{
        ...result.years[0],
        albums: [{ ...result.years[0]!.albums[0], originalPath: 'originals/private.jpg' }],
      }],
    }).success).toBe(false);
  });
});
