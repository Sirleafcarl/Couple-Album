import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallGuide() {
  const [installed, setInstalled] = useState(standalone);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    const mode = window.matchMedia?.('(display-mode: standalone)');
    const changed = () => setInstalled(standalone());
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    mode?.addEventListener('change', changed);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', done);
      mode?.removeEventListener('change', changed);
    };
  }, []);
  if (installed) return null;
  return <details className="pwa-install">
    <summary>添加到手机桌面</summary>
    <p>把「恋爱画廊」放到桌面，下次点图标就能打开。</p>
    {prompt && <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await prompt.prompt(); await prompt.userChoice; }
      catch { /* Keep the manual instructions available if the browser refuses. */ }
      finally { setPrompt(null); setBusy(false); }
    }}>安装恋爱画廊</button>}
    <p>iPhone：用 Safari 打开，点“分享”→“添加到主屏幕”。</p>
    <p>安卓：在浏览器菜单中选择“安装应用”或“添加到主屏幕”；不同浏览器名称可能不同。</p>
    <small>上传期间请保持页面在前台，锁屏或切换应用可能中断上传。</small>
  </details>;
}

export function NetworkNotice() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const lost = () => setOffline(true);
    const back = () => setOffline(false);
    window.addEventListener('offline', lost);
    window.addEventListener('online', back);
    return () => { window.removeEventListener('offline', lost); window.removeEventListener('online', back); };
  }, []);
  return offline ? <div className="pwa-network" role="status">网络已断开 · 暂时无法上传或加载照片，请联网后重试。</div> : null;
}
