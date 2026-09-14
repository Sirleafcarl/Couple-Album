import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicRoot = resolve(process.cwd(), 'public');
const readPublic = (path: string) => readFileSync(resolve(publicRoot, path.replace(/^\//, '')));
function pngSize(path: string) {
  const bytes = readPublic(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe('恋爱画廊 desktop app foundation', () => {
  it('defines a same-origin standalone app with standard and maskable icons', () => {
    const manifest = JSON.parse(readPublic('manifest.webmanifest').toString());
    expect(manifest).toMatchObject({
      id: '/', name: '恋爱画廊', short_name: '恋爱画廊', lang: 'zh-CN',
      start_url: '/', scope: '/', display: 'standalone',
      background_color: '#f7f1ea', theme_color: '#f7f1ea',
    });
    expect(manifest.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
    for (const icon of manifest.icons) expect(pngSize(icon.src)).toBe(icon.sizes);
  });

  it('links the manifest and Apple icon and names the page consistently', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.title).toBe('恋爱画廊');
    expect(doc.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.webmanifest');
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe('恋爱画廊');
    expect(doc.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content')).toBe('yes');
    expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/icons/apple-touch-icon.png');
    expect(pngSize('/icons/apple-touch-icon.png')).toBe('180x180');
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/icons/favicon-32.png');
    expect(pngSize('/icons/favicon-32.png')).toBe('32x32');
  });
});
