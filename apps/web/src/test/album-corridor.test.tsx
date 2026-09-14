import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlbumCorridor } from '../album-wall/album-corridor.js';

const year = {
  year: 2026,
  themeId: 'secret-garden' as const,
  themeVersion: null,
  albums: [{
    id: 'spring-picnic',
    title: '春日野餐记',
    occurredOn: '2026-03-28',
    description: '风很轻，草地刚刚变绿。',
    coverUrl: null,
    month: 3,
    year: 2026,
    version: 1,
    createdBy: {
      id: '10000000-0000-4000-8000-000000000001',
      displayName: 'Alice',
    },
  }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('album corridor', () => {
  it('omits duplicate heading controls when the page supplies a compact toolbar', () => {
    render(<AlbumCorridor compactHeader autoPlay={false} onCreate={vi.fn()} onEdit={vi.fn()} year={year} />);
    expect(screen.queryByRole('button', { name: '新建相册' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '2026 年相册廊' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3月' })).toBeInTheDocument();
  });
  it('pauses themed effects while editor, preview or hidden document is active', () => {
    const props = { onCreate: vi.fn(), onEdit: vi.fn(), year: { ...year, themeId: 'cloud-candy' as const } };
    const { container, rerender } = render(<AlbumCorridor {...props} autoPlay />);
    const stage = container.querySelector('.album-corridor__stage')!;
    expect(stage).toHaveAttribute('data-motion', 'running');
    fireEvent.click(screen.getByRole('button', { name: /打开相册/ }));
    expect(stage).toHaveAttribute('data-motion', 'paused');
    fireEvent.click(screen.getByRole('button', { name: '关闭相册预览' }));
    expect(stage).toHaveAttribute('data-motion', 'running');
    rerender(<AlbumCorridor {...props} autoPlay={false} />);
    expect(stage).toHaveAttribute('data-motion', 'paused');
    rerender(<AlbumCorridor {...props} autoPlay />);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(stage).toHaveAttribute('data-motion', 'paused');
  });
  it('renders albums on a controllable year timeline', async () => {
    const browser = userEvent.setup();
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    render(<AlbumCorridor autoPlay onCreate={vi.fn()} onEdit={vi.fn()} year={year} />);

    const corridor = screen.getByRole('region', { name: '2026 年相册廊' });
    expect(corridor).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /打开相册/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '暂停自动浏览' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建相册' })).toBeInTheDocument();

    fireEvent.pointerEnter(corridor);
    expect(screen.queryByRole('button', { name: '继续自动浏览' })).not.toBeInTheDocument();

    await browser.click(screen.getByRole('button', { name: '3月' }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('opens a focused album preview and returns focus when closed', async () => {
    const browser = userEvent.setup();
    const onEdit = vi.fn();
    render(<AlbumCorridor autoPlay={false} onCreate={vi.fn()} onEdit={onEdit} year={year} />);

    const opener = screen.getByRole('button', { name: '打开相册：春日野餐记' });
    await browser.click(opener);
    expect(screen.getByRole('dialog', { name: '春日野餐记' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '春日野餐记的封面' })).toHaveAttribute('src', '/themes/secret-garden/scene.webp');
    expect(screen.getByRole('link', { name: '进入相册' })).toHaveAttribute('href', '/albums/spring-picnic');
    expect(screen.getByRole('button', { name: '关闭相册预览' })).toHaveFocus();
    await browser.click(screen.getByRole('button', { name: '编辑相册' }));
    expect(onEdit).toHaveBeenCalledWith(year.albums[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('scrolls a newly focused album into view once', () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    const { rerender } = render(
      <AlbumCorridor autoPlay={false} onCreate={vi.fn()} onEdit={vi.fn()} year={year} />,
    );
    rerender(
      <AlbumCorridor
        autoPlay={false}
        focusAlbumId="spring-picnic"
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        year={year}
      />,
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
