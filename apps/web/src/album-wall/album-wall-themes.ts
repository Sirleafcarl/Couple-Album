import type { AlbumWallTheme, AlbumWallThemeId } from './album-wall-types.js';

export const albumWallThemes: Record<AlbumWallThemeId, AlbumWallTheme> = {
  'daylight': { id: 'daylight', label: '日光之间', scene: 'daylight', className: 'album-wall--daylight', modern: true, layout: 'editorial', accent: '#bd4744', description: '干净留白 · 错落照片' },
  'heart-frequency': { id: 'heart-frequency', label: '心动频率', scene: 'heart-frequency', className: 'album-wall--heart-frequency', modern: true, layout: 'collage', accent: '#c86083', description: '透明丝带 · 自由拼贴', background: '/themes/heart-frequency/scene.webp' },
  'sacred-joy': { id: 'sacred-joy', label: '神圣快乐', scene: 'sacred-joy', className: 'album-wall--sacred-joy', modern: true, layout: 'orbit', accent: '#a47722', description: '金色云海 · 发光相册', background: '/themes/sacred-joy/scene.webp' },
  'love-playground': { id: 'love-playground', label: '恋爱游乐场', scene: 'love-playground', className: 'album-wall--love-playground', modern: true, layout: 'pop', accent: '#2254ba', description: '俏皮波普 · 异形照片', background: '/themes/love-playground/scene.webp' },
  'blue-holiday': { id: 'blue-holiday', label: '蓝色假期', scene: 'blue-holiday', className: 'album-wall--blue-holiday', modern: true, layout: 'gallery', accent: '#277d9c', description: '海岸水光 · 悬浮画廊', background: '/themes/blue-holiday/scene.webp' },
  'cloud-candy': { id: 'cloud-candy', label: '云端软糖', scene: 'cloud-candy', className: 'album-wall--cloud-candy', modern: true, layout: 'hanging', accent: '#e97e6c', description: '柔软云端 · 红绳微风', background: '/themes/cloud-candy/scene.webp' },
  'tropical-cutout': { id: 'tropical-cutout', label: '热带剪纸', scene: 'tropical-cutout', className: 'album-wall--tropical-cutout', modern: true, layout: 'collage', accent: '#307446', description: '鲜活剪纸 · 错落构图', background: '/themes/tropical-cutout/scene.webp' },
  'clear-specimen': { id: 'clear-specimen', label: '透明标本室', scene: 'clear-specimen', className: 'album-wall--clear-specimen', modern: true, layout: 'gallery', accent: '#627775', description: '玻璃折光 · 通透展架', background: '/themes/clear-specimen/scene.webp' },
  'photo-exhibition': { id: 'photo-exhibition', label: '两个人的摄影展', scene: 'photo-exhibition', className: 'album-wall--photo-exhibition', modern: true, layout: 'editorial', accent: '#383d42', description: '克制黑白 · 摄影排版' },
  'heart-track': { id: 'heart-track', label: '心动轨道', scene: 'heart-track', className: 'album-wall--heart-track', modern: true, layout: 'track', accent: '#75609a', description: '淡紫曲面 · 连续旅程', background: '/themes/heart-track/scene.webp' },
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
  'date-adventure': {
    id: 'date-adventure',
    label: '约会冒险',
    scene: 'journey',
    className: 'album-wall--date-adventure',
  },
};
