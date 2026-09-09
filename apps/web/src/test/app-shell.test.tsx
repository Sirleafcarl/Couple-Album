import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '../components/app-shell.js';

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); } });
});
afterEach(() => {
  cleanup();
  for (const [key, descriptor] of [['showModal', originalShow], ['close', originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});

describe('story spine navigation', () => {
  it('keeps content beside a navigation landmark with one current destination', () => {
    render(<MemoryRouter initialEntries={['/library']}><AppShell><h1>真实照片库</h1></AppShell></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '真实照片库' }).closest('.story-content')).not.toBeNull();
    const nav = screen.getByRole('navigation', { name: '主要导航' });
    expect(within(nav).getByRole('link', { name: '照片库' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: '相册廊' })).not.toHaveAttribute('aria-current');
  });

  it('opens a modal navigation and restores focus after cancellation', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><h1>内容</h1></AppShell></MemoryRouter>);
    const opener = screen.getByRole('button', { name: '打开导航' });
    await user.click(opener);
    const drawer = screen.getByRole('dialog', { name: '主要导航' });
    expect(drawer).toHaveAttribute('open');
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    fireEvent(drawer, new Event('cancel', { cancelable: true }));
    expect(drawer).not.toHaveAttribute('open');
    expect(opener).toHaveFocus();
    expect(opener).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes after selecting a destination without dropping page content', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><h1>内容</h1></AppShell></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '打开导航' }));
    const drawer = screen.getByRole('dialog', { name: '主要导航' });
    await user.click(within(drawer).getByRole('link', { name: '上传中心' }));
    expect(drawer).not.toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: '内容' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: '主要导航' })).getByRole('link', { name: '上传中心' })).toHaveAttribute('aria-current', 'page');
  });
});
