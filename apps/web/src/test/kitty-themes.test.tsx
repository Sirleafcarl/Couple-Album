import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { AlbumThemeIdSchema } from '@memory/contracts/albums';
import { RoomThemeProvider, useRoomTheme } from '../themes/room-theme.js';

afterEach(() => { cleanup(); localStorage.clear(); });
function Controls() {
  const { roomTheme, selectRoomTheme } = useRoomTheme();
  return <><output>{roomTheme ?? 'none'}</output><button onClick={() => selectRoomTheme('kitty-dream')}>pink</button><button onClick={() => selectRoomTheme('clear-specimen')}>plain</button></>;
}
describe('Kitty themes', () => {
  it('accepts both persisted annual theme IDs', () => {
    expect(AlbumThemeIdSchema.safeParse('kitty-dream').success).toBe(true);
    expect(AlbumThemeIdSchema.safeParse('kitty-gallery').success).toBe(true);
  });
  it('remembers only allowed worlds and clears them for non-Kitty years', () => {
    localStorage.setItem('memory:room-theme', 'untrusted-value');
    const first = render(<RoomThemeProvider><Controls /></RoomThemeProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('none');
    fireEvent.click(screen.getByText('pink'));
    expect(localStorage.getItem('memory:room-theme')).toBe('kitty-dream');
    first.unmount();
    render(<RoomThemeProvider><Controls /></RoomThemeProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('kitty-dream');
    fireEvent.click(screen.getByText('plain'));
    expect(screen.getByRole('status')).toHaveTextContent('none');
    expect(localStorage.getItem('memory:room-theme')).toBeNull();
  });
});
