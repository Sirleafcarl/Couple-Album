import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/auth-provider.js';
import { ProtectedRoute } from './auth/protected-route.js';
import { HomePage } from './pages/home-page.js';
import { LoginPage } from './pages/login-page.js';
import { LibraryPage } from './pages/library-page.js';
import { TrashPage } from './pages/trash-page.js';
import { AlbumPage } from './pages/album-page.js';
import { RoomThemeProvider } from './themes/room-theme.js';
import { NetworkNotice } from './pwa/pwa-experience.js';

export function App() {
  return (
    <RoomThemeProvider><AuthProvider>
      <NetworkNotice />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/uploads" element={<Navigate to="/library" replace />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/albums/:albumId" element={<AlbumPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider></RoomThemeProvider>
  );
}
