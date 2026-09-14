import * as THREE from 'three';
import type { AlbumWallItem } from '../album-wall/album-wall-types.js';

export function albumCanvasTexture(album: AlbumWallItem, aspect: number, label = false) {
  const canvas = document.createElement('canvas');
  canvas.width = label ? 768 : Math.round(768 * Math.min(1.5, aspect)); canvas.height = label ? 168 : 768;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = label ? '#fff1df' : '#f6e3dc'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#804853';
    if (label) {
      ctx.font = '60px "Songti SC", serif'; ctx.fillText(album.title, w / 2, 65, w - 36);
      ctx.fillStyle = '#806551'; ctx.font = '44px Georgia, serif'; ctx.fillText(album.occurredOn.replaceAll('-', '.'), w / 2, 130);
    } else {
      ctx.strokeStyle = '#dbb8aa'; ctx.lineWidth = 2; ctx.strokeRect(25, 25, w - 50, h - 50);
      const date = album.occurredOn.split('-');
      ctx.font = '136px Georgia, serif'; ctx.fillText(date[1] ?? '', w / 2, h * .32);
      ctx.font = '40px Georgia, serif'; ctx.fillText('/', w / 2, h * .43);
      ctx.font = '136px Georgia, serif'; ctx.fillText(date[2] ?? '', w / 2, h * .57);
      ctx.font = 'italic 28px Georgia, serif'; ctx.fillText('Our little moments', w / 2, h * .76, w - 65);
      ctx.font = '22px "Songti SC", serif'; ctx.fillText('等待我们的故事', w / 2, h * .84, w - 55);
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function fitAlbumTexture(texture: THREE.Texture, aspect: number, imageWidth: number, imageHeight: number) {
  const source = imageWidth / imageHeight;
  texture.repeat.set(1, 1); texture.offset.set(0, 0);
  if (source > aspect) { texture.repeat.x = aspect / source; texture.offset.x = (1 - texture.repeat.x) / 2; }
  else { texture.repeat.y = source / aspect; texture.offset.y = (1 - texture.repeat.y) / 2; }
}
