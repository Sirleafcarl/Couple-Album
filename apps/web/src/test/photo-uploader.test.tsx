import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoUploader } from '../components/photo-uploader.js';

const uploadPhoto = vi.fn();
const addAlbumPhotos = vi.fn();
vi.mock('../api/albums.js', () => ({ addAlbumPhotos: (...args: unknown[]) => addAlbumPhotos(...args) }));
vi.mock('../api/photos.js', () => ({
  uploadPhoto: (...args: unknown[]) => uploadPhoto(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  uploadPhoto.mockReset();
  addAlbumPhotos.mockReset();
});

describe('PhotoUploader', () => {
  it('hides completed album uploads in compact mode without hiding failures', async () => {
    uploadPhoto.mockResolvedValueOnce({ photoId: 'saved' }).mockRejectedValueOnce(new Error('offline'));
    addAlbumPhotos.mockResolvedValue({ ok: true });
    const input = createRef<HTMLInputElement>();
    const browser = userEvent.setup();
    const { container } = render(<PhotoUploader compact fileInputRef={input} albumId="album" onUploaded={vi.fn()} />);
    await browser.upload(input.current!, new File(['a'], 'done.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(addAlbumPhotos).toHaveBeenCalledWith('album', ['saved']));
    await waitFor(() => expect(screen.queryByText('已加入相册')).not.toBeInTheDocument());
    expect(container.querySelector('.photo-uploader')).toHaveAttribute('hidden');
    await browser.upload(input.current!, new File(['b'], 'failed.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('failed.jpg 上传失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试上传' })).toBeInTheDocument();
  });
  it('supports a direct picker without a second upload introduction', () => {
    const input = createRef<HTMLInputElement>();
    render(<PhotoUploader compact fileInputRef={input} albumId="album" onUploaded={() => undefined} />);
    expect(screen.queryByText('从本地上传到相册')).not.toBeInTheDocument();
    expect(input.current).toHaveAttribute('type', 'file');
    expect(input.current).toHaveAttribute('multiple');
    expect(input.current).not.toHaveAttribute('capture');
  });
  it('retries membership without uploading the saved original again', async () => {
    uploadPhoto.mockResolvedValue({ photoId: 'saved-photo', status: 'processing' });
    addAlbumPhotos.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true });
    const onUploaded = vi.fn();
    const browser = userEvent.setup();
    render(<PhotoUploader albumId="partner-album" onUploaded={onUploaded} />);
    await browser.upload(screen.getByLabelText('选择照片'), new File(['a'], 'ours.jpg'));
    expect(await screen.findByText('原图已保存，加入相册失败')).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
    await browser.click(screen.getByRole('button', { name: '重试加入相册' }));
    expect(await screen.findByText('已加入相册')).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(addAlbumPhotos).toHaveBeenCalledTimes(2);
    expect(addAlbumPhotos).toHaveBeenLastCalledWith('partner-album', ['saved-photo']);
    expect(onUploaded).toHaveBeenCalledOnce();
  });

  it('reuses a duplicate original directly in the target album', async () => {
    const photoId = '10000000-0000-4000-8000-000000000001';
    uploadPhoto.mockRejectedValue({ code: 'DUPLICATE_PHOTO', body: {
      error: 'DUPLICATE_PHOTO', existingPhotoId: photoId,
    } });
    addAlbumPhotos.mockResolvedValue({ ok: true });
    const browser = userEvent.setup();
    render(<PhotoUploader albumId="other-album" onUploaded={() => undefined} />);
    await browser.upload(screen.getByLabelText('选择照片'), new File(['a'], 'same.jpg'));
    await browser.click(await screen.findByRole('button', { name: '使用已有照片' }));
    expect(await screen.findByText('已加入相册')).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(addAlbumPhotos).toHaveBeenCalledWith('other-album', [photoId]);
  });
  it('uploads selected files sequentially and reports each result', async () => {
    const first = deferred<unknown>();
    uploadPhoto.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ status: 'processing' });
    const browser = userEvent.setup();
    render(<PhotoUploader onUploaded={() => undefined} />);
    const files = [new File(['a'], 'first.jpg'), new File(['b'], 'second.jpg')];
    await browser.upload(screen.getByLabelText('选择照片'), files);

    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    first.resolve({ status: 'processing' });
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('second.jpg 已加入处理队列')).toBeInTheDocument();
  });

  it('shows real progress reported for the active file', async () => {
    const pending = deferred<unknown>();
    uploadPhoto.mockReturnValueOnce(pending.promise);
    const browser = userEvent.setup();
    render(<PhotoUploader onUploaded={() => undefined} />);
    await browser.upload(screen.getByLabelText('选择照片'), new File(['a'], 'progress.jpg'));

    const options = uploadPhoto.mock.calls[0]?.[1] as { onProgress: (value: number) => void };
    options.onProgress(47);
    expect(await screen.findByText('上传中 47%')).toBeInTheDocument();
  });

  it('asks before explicitly retaining a duplicate', async () => {
    uploadPhoto
      .mockRejectedValueOnce({ code: 'DUPLICATE_PHOTO' })
      .mockResolvedValueOnce({ status: 'processing' });
    const browser = userEvent.setup();
    render(<PhotoUploader onUploaded={() => undefined} />);
    const file = new File(['a'], 'duplicate.jpg');
    await browser.upload(screen.getByLabelText('选择照片'), file);

    expect(await screen.findByRole('dialog', { name: '发现重复照片' })).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: '仍然保留' }));
    await waitFor(() => expect(uploadPhoto).toHaveBeenLastCalledWith(
      file,
      expect.objectContaining({ allowDuplicate: true }),
    ));
  });

  it('can cancel a queued file and continues after another file fails', async () => {
    const first = deferred<unknown>();
    uploadPhoto.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('failed'));
    const browser = userEvent.setup();
    render(<PhotoUploader onUploaded={() => undefined} />);
    await browser.upload(screen.getByLabelText('选择照片'), [
      new File(['a'], 'first.jpg'),
      new File(['b'], 'failed.jpg'),
      new File(['c'], 'cancel.jpg'),
    ]);
    await browser.click(screen.getByRole('button', { name: '取消 cancel.jpg' }));
    first.resolve({ status: 'processing' });

    expect(await screen.findByText('failed.jpg 上传失败')).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('cancel.jpg')).not.toBeInTheDocument();
  });
});
import { createRef } from 'react';
