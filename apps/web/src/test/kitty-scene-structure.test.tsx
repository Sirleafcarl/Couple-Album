import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KittyCorridor } from '../themes/kitty-corridor.js';
import type { AlbumWallItem } from '../album-wall/album-wall-types.js';

afterEach(cleanup);

it.each(['kitty-dream', 'kitty-gallery'] as const)('%s keeps architecture separate from interactive photographs', theme => {
  const album = { id: 'album-one', title: '海边散步', occurredOn: '2026-09-09', coverUrl: '/test-photo.jpg' } as AlbumWallItem;
  const onOpen = vi.fn();
  const { container } = render(<KittyCorridor albums={[album]} theme={theme} height={680} viewportWidth={1200} onOpen={onOpen} />);
  const button = screen.getByRole('button', { name: '打开相册：海边散步' });
  expect(button.querySelector('.kitty-album__frame')).toBeNull();
  expect(container.querySelector(theme === 'kitty-dream' ? '.kitty-cabinet' : '.kitty-gallery-island')).not.toBeNull();
  if (theme === 'kitty-dream') expect(container.querySelector('article > .kitty-display-friend')).not.toBeNull();
  else expect(container.querySelector('article > .kitty-display-friend')).toBeNull();
  expect(button.querySelector('img')?.getAttribute('src')).toBe('/test-photo.jpg');
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledWith(album, button);
});
