import type { AlbumWallTheme, AlbumWallThemeId } from './album-wall-types.js';

export const albumWallThemes: Record<AlbumWallThemeId, AlbumWallTheme> = {
  'kitty-dream': { id: 'kitty-dream', label: 'Kitty · 粉色梦幻房间', scene: 'kitty-dream', className: 'album-wall--kitty-dream', modern: true, layout: 'collage', accent: '#c94073', description: '绒面缎带 · 双人收藏屋', background: '/themes/kitty-dream/scene.webp' },
  'kitty-gallery': { id: 'kitty-gallery', label: 'Kitty · 3D 玩具展示馆', scene: 'kitty-gallery', className: 'album-wall--kitty-gallery', modern: true, layout: 'gallery', accent: '#c81732', description: '亚克力展台 · 搪胶收藏馆', background: '/themes/kitty-gallery/scene.webp' },
  'sacred-joy': { id: 'sacred-joy', label: '神圣快乐', scene: 'sacred-joy', className: 'album-wall--sacred-joy', modern: true, layout: 'orbit', accent: '#8b581b', description: '奶蛙神迹 · 云端珍藏', background: '/themes/sacred-joy/scene.webp' },
  'cloud-candy': { id: 'cloud-candy', label: '云端软糖', scene: 'cloud-candy', className: 'album-wall--cloud-candy', modern: true, layout: 'hanging', accent: '#e97e6c', description: '柔软云端 · 红绳微风', background: '/themes/cloud-candy/scene.webp' },
  'clear-specimen': { id: 'clear-specimen', label: '透明标本室', scene: 'clear-specimen', className: 'album-wall--clear-specimen', modern: true, layout: 'gallery', accent: '#627775', description: '玻璃折光 · 通透展架', background: '/themes/clear-specimen/scene.webp' },
  'sky-letters': { id: 'sky-letters', label: '晴空来信', scene: 'sky-letters', className: 'album-wall--sky-letters', modern: true, layout: 'arc', accent: '#e46a6d', description: '轻盈蓝天 · 弧线相册', background: '/themes/sky-letters/scene.webp' },
  'secret-garden': {
    id: 'secret-garden',
    label: '秘密花园',
    scene: 'garden',
    className: 'album-wall--secret-garden',
  },
  'love-letters': {
    id: 'love-letters',
    label: '共同情书',
    scene: 'desk',
    className: 'album-wall--love-letters',
  },
};
