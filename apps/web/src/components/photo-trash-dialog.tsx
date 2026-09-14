import { useEffect, useRef, useState } from 'react';
import type { PhotoSummary } from '@memory/contracts/photos';
import { trashPhoto } from '../api/photos.js';

export function PhotoTrashDialog({ photo, onClose, onDeleted }: { photo: PhotoSummary; onClose(): void; onDeleted(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
    cancelRef.current?.focus();
    return () => {
      dialog?.close?.(); document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  async function confirm() {
    if (busy) return;
    if (step === 1) { setStep(2); cancelRef.current?.focus(); return; }
    setBusy(true); setError(false);
    try { await trashPhoto(photo.id); onDeleted(); } catch { setError(true); setBusy(false); }
  }
  return <dialog ref={dialogRef} className="photo-trash-dialog" aria-label="删除照片" aria-modal="true"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <span className="eyebrow">{step === 1 ? '暂时收起这张回忆' : '再确认一下'}</span>
    <h2>{step === 1 ? '移入回收站？' : '确认从照片库删除？'}</h2>
    <p className="photo-trash-dialog__filename">{photo.originalFilename}</p>
    <p>照片会从照片库和所有相册中隐藏，30 天内可在回收站恢复。恢复时会回到仍然存在的原相册。</p>
    {step === 2 ? <p>超过 30 天将无法恢复，请确认这张照片确实不再需要。</p> : null}
    {error ? <p role="alert">暂时无法删除，照片仍保留在照片库，请重试。</p> : null}
    <footer><button ref={cancelRef} type="button" disabled={busy} onClick={onClose}>取消</button>
      <button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? '正在移入…' : step === 1 ? '继续删除' : '确认移入回收站'}</button></footer>
  </dialog>;
}
