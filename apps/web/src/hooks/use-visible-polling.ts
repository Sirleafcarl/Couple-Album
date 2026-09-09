import { useEffect, useRef } from 'react';

export function useVisiblePolling(active: boolean, refresh: () => void, intervalMs = 3000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
}
