import { useEffect, useRef, useState, type Ref } from 'react';
import { uploadPhoto } from '../api/photos.js';
import { addAlbumPhotos } from '../api/albums.js';
import { DuplicatePhotoResponseSchema } from '@memory/contracts/photos';

type QueueStatus = 'queued' | 'uploading' | 'uploaded' | 'failed' | 'duplicate' | 'attaching' | 'link-failed';

type QueueItem = {
  id: number;
  file: File;
  status: QueueStatus;
  progress: number;
  allowDuplicate: boolean;
  albumId?: string;
  photoId?: string;
  existingPhotoId?: string;
};

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String(error.code);
  }
  return undefined;
}

export function PhotoUploader({ onUploaded, albumId, compact = false, fileInputRef }: { onUploaded: () => void; albumId?: string | undefined; compact?: boolean; fileInputRef?: Ref<HTMLInputElement> }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const nextId = useRef(0);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const active = queue.find((item) => item.status === 'uploading' || item.status === 'duplicate' || item.status === 'attaching');
  const next = active ? undefined : queue.find((item) => item.status === 'queued');

  useEffect(() => {
    if (!next) return;
    const id = next.id;
    const file = next.file;
    const allowDuplicate = next.allowDuplicate;
    setQueue((current) => current.map((item) => item.id === id
      ? { ...item, status: 'uploading', progress: 0 }
      : item));

    let savedPhotoId = next.photoId;
    const saved = savedPhotoId ? Promise.resolve({ photoId: savedPhotoId }) : uploadPhoto(file, {
      allowDuplicate,
      onProgress: (progress) => setQueue((current) => current.map((item) => item.id === id
        ? { ...item, progress }
        : item)),
    });
    void saved.then(async (result) => {
      savedPhotoId = result.photoId;
      if (next.albumId) {
        if (!savedPhotoId) throw new Error('Missing saved photo');
        setQueue(current => current.map(item => item.id === id ? { ...item, photoId: savedPhotoId!, status: 'attaching' } : item));
        await addAlbumPhotos(next.albumId, [savedPhotoId]);
      }
      setQueue((current) => current.map((item) => item.id === id
        ? { ...item, status: 'uploaded', progress: 100 }
        : item));
      onUploadedRef.current();
    }).catch((error: unknown) => {
      const body = typeof error === 'object' && error !== null && 'body' in error ? error.body : null;
      const duplicate = DuplicatePhotoResponseSchema.safeParse(body);
      setQueue((current) => current.map((item) => item.id === id
        ? { ...item, ...(savedPhotoId ? { photoId: savedPhotoId } : {}),
          ...(duplicate.success ? { existingPhotoId: duplicate.data.existingPhotoId } : {}),
          status: savedPhotoId && next.albumId ? 'link-failed' : errorCode(error) === 'DUPLICATE_PHOTO' ? 'duplicate' : 'failed' }
        : item));
    });
  }, [next]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const additions = Array.from(files, (file): QueueItem => ({
      id: nextId.current++,
      file,
      status: 'queued',
      progress: 0,
      allowDuplicate: false,
      ...(albumId ? { albumId } : {}),
    }));
    setQueue((current) => [...current, ...additions]);
  }

  function resolveDuplicate(id: number, keep: boolean) {
    setQueue((current) => keep
      ? current.map((item) => item.id === id
        ? { ...item, status: 'queued', allowDuplicate: true }
        : item)
      : current.filter((item) => item.id !== id));
  }

  const duplicate = queue.find((item) => item.status === 'duplicate');
  const visibleQueue = compact ? queue.filter(item => item.status !== 'uploaded') : queue;

  useEffect(() => {
    if (!queue.some(item => ['queued', 'uploading', 'attaching', 'duplicate', 'link-failed'].includes(item.status))) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [queue]);

  return (
    <section className={compact ? 'photo-uploader photo-uploader--compact' : 'photo-uploader'} aria-label={compact ? '照片上传进度' : undefined} aria-labelledby={compact ? undefined : 'photo-uploader-title'} hidden={compact && visibleQueue.length === 0}>
      {!compact ? <div>
        <p className="eyebrow">把今天，放进我们的故事</p>
        <h2 id="photo-uploader-title">{albumId ? '从本地上传到相册' : '收藏这一次的小美好'}</h2>
        <p>原图进入你的照片库{albumId ? '，同时加入当前相册' : ''}。上传期间请留在当前页面。</p>
      </div> : null}
      <label className="upload-picker" hidden={compact}>
        <span>选择照片</span>
        <input
          ref={fileInputRef}
          accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
          type="file"
        />
      </label>

      {visibleQueue.length > 0 ? (
        <ul className="upload-queue">
          {visibleQueue.map((item) => (
            <li key={item.id}>
              <span>{item.file.name}</span>
              {item.status === 'queued' ? (
                <button type="button" aria-label={`取消 ${item.file.name}`} onClick={() => setQueue((current) => current.filter((entry) => entry.id !== item.id))}>取消</button>
              ) : null}
              {item.status === 'uploading' ? <span>上传中 {item.progress}% <progress aria-label={`${item.file.name} 上传进度`} max={100} value={item.progress} /></span> : null}
              {item.status === 'uploaded' && !item.albumId ? <span>{item.file.name} 已加入处理队列</span> : null}
              {item.status === 'uploaded' && item.albumId ? <span>已加入相册</span> : null}
              {item.status === 'attaching' ? <span>原图已保存，正在加入相册</span> : null}
              {item.status === 'link-failed' ? <><span role="alert">原图已保存，加入相册失败</span><button type="button" onClick={() => setQueue(current => current.map(entry => entry.id === item.id ? { ...entry, status: 'queued' } : entry))}>重试加入相册</button></> : null}
              {item.status === 'failed' ? <><span>{item.file.name} 上传失败</span><button type="button" onClick={() => setQueue(current => current.map(entry => entry.id === item.id ? { ...entry, status: 'queued' } : entry))}>重试上传</button></> : null}
              {item.status === 'duplicate' ? <span>等待选择</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {duplicate ? (
        <div aria-labelledby="duplicate-title" aria-modal="true" className="duplicate-dialog" role="dialog">
          <h3 id="duplicate-title">发现重复照片</h3>
          <p>照片库里已经有一张内容相同的照片。</p>
          <div>
            <button type="button" onClick={() => resolveDuplicate(duplicate.id, false)}>跳过</button>
            <button type="button" onClick={() => resolveDuplicate(duplicate.id, true)}>仍然保留</button>
            {duplicate.albumId && duplicate.existingPhotoId ? <button type="button" onClick={() => setQueue(current => current.map(item => item.id === duplicate.id ? { ...item, photoId: duplicate.existingPhotoId!, status: 'queued' } : item))}>使用已有照片</button> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
