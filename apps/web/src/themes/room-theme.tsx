import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type KittyTheme = 'kitty-dream' | 'kitty-gallery';
export function isKittyTheme(value: unknown): value is KittyTheme {
  return value === 'kitty-dream' || value === 'kitty-gallery';
}
const key = 'memory:room-theme';
function readTheme(): KittyTheme | null {
  try { const value = localStorage.getItem(key); return isKittyTheme(value) ? value : null; }
  catch { return null; }
}
const RoomTheme = createContext<{ roomTheme: KittyTheme | null; selectRoomTheme(value: string): void }>({ roomTheme: null, selectRoomTheme: () => {} });
export function RoomThemeProvider({ children }: { children: ReactNode }) {
  const [roomTheme, setTheme] = useState(readTheme);
  const selectRoomTheme = useCallback((value: string) => {
    const next = isKittyTheme(value) ? value : null;
    setTheme(next);
    try { if (next) localStorage.setItem(key, next); else localStorage.removeItem(key); } catch { /* Private browsing may disable persistence. */ }
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) setTheme(readTheme()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <RoomTheme.Provider value={{ roomTheme, selectRoomTheme }}>{children}</RoomTheme.Provider>;
}
export function useRoomTheme() { return useContext(RoomTheme); }
