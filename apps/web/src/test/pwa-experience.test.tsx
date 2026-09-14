import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InstallGuide, NetworkNotice } from '../pwa/pwa-experience.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('offers manual installation without opening a popup', () => {
  render(<InstallGuide />);
  expect(screen.getByText('添加到手机桌面')).toBeInTheDocument();
  expect(document.querySelector('details')).not.toHaveAttribute('open');
  expect(screen.getByText(/Safari/)).toBeInTheDocument();
});
it('hides installation in a standalone window', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(<InstallGuide />);
  expect(screen.queryByText('添加到手机桌面')).not.toBeInTheDocument();
});
it('shows offline status and clears it on reconnection', () => {
  render(<NetworkNotice />);
  fireEvent(window, new Event('offline'));
  expect(screen.getByRole('status')).toHaveTextContent('网络已断开');
  fireEvent(window, new Event('online'));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('waits for an explicit click and consumes a dismissed install prompt', async () => {
  render(<InstallGuide />);
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  fireEvent(window, event);
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '安装恋爱画廊' }));
  const { waitFor } = await import('@testing-library/react');
  await waitFor(() => expect(screen.queryByRole('button', { name: '安装恋爱画廊' })).not.toBeInTheDocument());
  expect(prompt).toHaveBeenCalledTimes(1);
});
