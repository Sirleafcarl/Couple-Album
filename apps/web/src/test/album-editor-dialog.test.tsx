import type { AlbumSummary, CreateAlbumInput, UpdateAlbumInput } from '@memory/contracts/albums';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlbumEditorDialog } from '../album-wall/album-editor-dialog.js';
import { AlbumApiError } from '../api/albums.js';

const album: AlbumSummary = {
  id: '30000000-0000-4000-8000-000000000003',
  title: '春日野餐记',
  description: '风很轻。',
  occurredOn: '2026-03-28',
  year: 2026,
  month: 3,
  coverUrl: null,
  version: 3,
  createdBy: {
    id: '10000000-0000-4000-8000-000000000001',
    displayName: 'Alice',
  },
};

afterEach(cleanup);

describe('AlbumEditorDialog', () => {
  it('previews the title and asks before discarding a changed draft', async () => {
    const browser = userEvent.setup();
    const onClose = vi.fn();
    render(<AlbumEditorDialog initialDate="2026-09-08" mode="create" onClose={onClose} onSubmit={vi.fn()} />);
    await browser.type(screen.getByLabelText('相册名称'), '雨天约会');
    expect(within(screen.getByLabelText('相册封面预览')).getByText('雨天约会')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: '关闭相册编辑' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('这页还没有保存')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: '继续填写' }));
    expect(screen.getByLabelText('相册名称')).toHaveValue('雨天约会');
    await browser.click(screen.getByRole('button', { name: '取消' }));
    await browser.click(screen.getByRole('button', { name: '放弃修改' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes an unchanged form directly', async () => {
    const onClose = vi.fn();
    render(<AlbumEditorDialog album={album} mode="edit" onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('shows required-field errors and live character counters', async () => {
    const browser = userEvent.setup();
    render(<AlbumEditorDialog
      initialDate=""
      mode="create"
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />);

    await browser.type(screen.getByLabelText('相册名称'), '周末');
    await browser.type(screen.getByLabelText('这一页的故事'), '一起散步');
    expect(screen.getByText('2 / 80')).toBeInTheDocument();
    expect(screen.getByText('4 / 500')).toBeInTheDocument();

    await browser.clear(screen.getByLabelText('相册名称'));
    await browser.click(screen.getByRole('button', { name: '创建相册' }));
    expect(screen.getByText('请写下相册名称')).toBeInTheDocument();
    expect(screen.getByText('请选择这段回忆发生的日期')).toBeInTheDocument();
  });

  it('submits a trimmed create payload once while saving', async () => {
    const browser = userEvent.setup();
    let finish!: () => void;
    const onSubmit = vi.fn<(input: CreateAlbumInput) => Promise<void>>()
      .mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<AlbumEditorDialog
      initialDate="2026-09-07"
      mode="create"
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />);

    await browser.type(screen.getByLabelText('相册名称'), '  夜晚散步  ');
    await browser.type(screen.getByLabelText('这一页的故事'), '  路灯很暖。  ');
    await browser.click(screen.getByRole('button', { name: '创建相册' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: '夜晚散步', description: '路灯很暖。', occurredOn: '2026-09-07',
    });
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled();
    finish();
  });

  it('prefills edit values, keeps the draft after failure, and submits its version', async () => {
    const browser = userEvent.setup();
    const onSubmit = vi.fn<(input: UpdateAlbumInput) => Promise<void>>()
      .mockRejectedValue(new Error('offline'));
    render(<AlbumEditorDialog album={album} mode="edit" onClose={vi.fn()} onSubmit={onSubmit} />);

    const title = screen.getByLabelText('相册名称');
    expect(title).toHaveValue('春日野餐记');
    await browser.clear(title);
    await browser.type(title, '春日雨');
    await browser.click(screen.getByRole('button', { name: '保存修改' }));

    expect(onSubmit).toHaveBeenCalledWith({
      version: 3,
      title: '春日雨',
      description: '风很轻。',
      occurredOn: '2026-03-28',
    });
    expect(title).toHaveValue('春日雨');
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请稍后再试');
  });

  it('keeps the draft on conflict until the user loads the latest server content', async () => {
    const browser = userEvent.setup();
    const current = { ...album, title: '对方刚改的标题', description: '最新内容', version: 4 };
    const onSubmit = vi.fn<(input: UpdateAlbumInput) => Promise<void>>()
      .mockRejectedValueOnce(new AlbumApiError('ALBUM_VERSION_CONFLICT', 409, {
        error: 'ALBUM_VERSION_CONFLICT', current,
      }))
      .mockResolvedValueOnce();
    render(<AlbumEditorDialog album={album} mode="edit" onClose={vi.fn()} onSubmit={onSubmit} />);

    const title = screen.getByLabelText('相册名称');
    await browser.clear(title);
    await browser.type(title, '我的草稿');
    await browser.click(screen.getByRole('button', { name: '保存修改' }));

    expect(title).toHaveValue('我的草稿');
    expect(screen.getByText('这本相册刚刚被更新过')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: '载入最新内容' }));
    expect(title).toHaveValue('对方刚改的标题');

    await browser.click(screen.getByRole('button', { name: '保存修改' }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
      version: 4, title: '对方刚改的标题', description: '最新内容',
    }));
  });
});
