import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth-provider.js';

export function ProtectedRoute() {
  const { loading, user } = useAuth();

  if (loading) return <p className="loading-state">正在加载…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
