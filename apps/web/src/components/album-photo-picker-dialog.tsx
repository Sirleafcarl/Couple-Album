import { useEffect, useRef } from 'react';
import { AlbumPhotoPicker } from './album-photo-picker.js';
import './album-photo-picker-dialog.css';

export function AlbumPhotoPickerDialog({ albumId, onClose, onAdded }: {
  albumId: string; onClose(): void; onAdded(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute('open', '');
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog?.open) dialog.close?.();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialogRef} className="album-photo-picker-dialog" aria-label="从照片库挑选" aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="album-photo-picker-dialog__bar"><span>挑选我们的回忆</span><button ref={closeRef} type="button" aria-label="关闭照片选择" onClick={onClose}>关闭</button></header>
    <AlbumPhotoPicker albumId={albumId} onAdded={() => { onAdded(); onClose(); }} />
  </dialog>;
}
