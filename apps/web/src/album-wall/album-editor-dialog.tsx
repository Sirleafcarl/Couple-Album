import {
  AlbumVersionConflictResponseSchema,
  CalendarDateSchema,
  type AlbumSummary,
  type CreateAlbumInput,
  type UpdateAlbumInput,
} from '@memory/contracts/albums';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import './album-editor.css';
import { StoryDatePicker } from '../components/story-date-picker.js';

type AlbumEditorDialogProps =
  | {
    mode: 'create';
    initialDate: string;
    onSubmit(input: CreateAlbumInput): Promise<void>;
    onClose(): void;
  }
  | {
    mode: 'edit';
    album: AlbumSummary;
    onSubmit(input: UpdateAlbumInput): Promise<void>;
    onClose(): void;
  };

type FieldErrors = { title?: string; occurredOn?: string };

export function AlbumEditorDialog(props: AlbumEditorDialogProps) {
  const initial = props.mode === 'edit' ? props.album : null;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [occurredOn, setOccurredOn] = useState(
    props.mode === 'edit' ? props.album.occurredOn : props.initialDate,
  );
  const [version, setVersion] = useState(initial?.version ?? 1);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<AlbumSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [baseline, setBaseline] = useState({ title: initial?.title ?? '', description: initial?.description ?? '', occurredOn: props.mode === 'edit' ? props.album.occurredOn : props.initialDate });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const dirty = title !== baseline.title || description !== baseline.description || occurredOn !== baseline.occurredOn;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute('open', '');
    titleRef.current?.focus();
    return () => { dialog?.close?.(); opener?.focus(); };
  }, []);
  useEffect(() => { if (discarding) keepRef.current?.focus(); }, [discarding]);

  function requestClose() {
    if (saving) return;
    if (dirty) setDiscarding(true);
    else props.onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FieldErrors = {};
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) nextErrors.title = '请写下相册名称';
    if (!occurredOn) nextErrors.occurredOn = '请选择这段回忆发生的日期';
    else if (!CalendarDateSchema.safeParse(occurredOn).success) nextErrors.occurredOn = '请填写有效日期，例如 2026/09/08';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    setConflict(null);
    try {
      if (props.mode === 'create') {
        await props.onSubmit({ title: trimmedTitle, description: trimmedDescription, occurredOn });
      } else {
        await props.onSubmit({
          version,
          title: trimmedTitle,
          description: trimmedDescription,
          occurredOn,
        });
      }
      props.onClose();
    } catch (error) {
      const body = typeof error === 'object' && error !== null && 'body' in error ? error.body : null;
      const parsed = AlbumVersionConflictResponseSchema.safeParse(body);
      if (parsed.success) {
        setConflict(parsed.data.current);
      } else {
        setSubmitError('保存失败，请稍后再试');
      }
    } finally {
      setSaving(false);
    }
  }

  function loadLatest() {
    if (!conflict) return;
    setTitle(conflict.title);
    setDescription(conflict.description);
    setOccurredOn(conflict.occurredOn);
    setVersion(conflict.version);
    setBaseline({ title: conflict.title, description: conflict.description, occurredOn: conflict.occurredOn });
    setConflict(null);
  }

  const titleErrorId = fieldErrors.title ? 'album-title-error' : undefined;
  const dateErrorId = fieldErrors.occurredOn ? 'album-date-error' : undefined;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="album-editor-title"
      aria-modal="true"
      className="album-composer"
      onCancel={(event) => { event.preventDefault(); if (discarding) { setDiscarding(false); titleRef.current?.focus(); } else requestClose(); }}
    >
      <div className="album-composer__layout">
      <aside className="album-composer__preview" aria-label="相册封面预览">
        <span className="album-composer__edition">OUR LITTLE COLLECTION</span>
        <div className="album-composer__book">
          <span className="album-composer__ribbon" aria-hidden="true" />
          <div className="album-composer__cover-art">
            {initial?.coverUrl ? <img src={initial.coverUrl} alt="" /> : <span>把这一天<br />轻轻收藏</span>}
          </div>
          <strong>{title.trim() || '还未命名的回忆'}</strong>
          <time dateTime={occurredOn || undefined}>{occurredOn ? occurredOn.replaceAll('-', ' · ') : '选一个值得记住的日子'}</time>
        </div>
        <p>一段日常，一本相册。<br />以后再翻开，还是我们。</p>
        <small>封面示意 · 创建后可添加照片</small>
      </aside>
      <form className="album-editor__paper" noValidate onSubmit={handleSubmit}>
        <button className="album-composer__close" aria-label="关闭相册编辑" disabled={saving} onClick={requestClose} type="button">×</button>
        <header>
          <p>{props.mode === 'create' ? '把今天，留给以后的我们' : '让回忆，多一点细节'}</p>
          <h2 id="album-editor-title">{props.mode === 'create' ? '新建相册' : '编辑相册'}</h2>
        </header>

        <label>
          <span>相册名称</span>
          <input
            ref={titleRef}
            disabled={saving}
            placeholder="比如：那天下午，我们去看海"
            aria-describedby={titleErrorId}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-label="相册名称"
            aria-required="true"
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <small>{title.length} / 80</small>
          {fieldErrors.title ? <em id={titleErrorId}>{fieldErrors.title}</em> : null}
        </label>

        <div className="album-composer__date">
          <span>发生日期</span>
          <StoryDatePicker value={occurredOn} onChange={setOccurredOn} disabled={saving} invalid={Boolean(fieldErrors.occurredOn)} errorId={dateErrorId} />
          {fieldErrors.occurredOn ? <em id={dateErrorId}>{fieldErrors.occurredOn}</em> : null}
        </div>

        <label>
          <span>这一页的故事 <b className="album-composer__optional">选填</b></span>
          <textarea
            disabled={saving}
            placeholder="天气、心情，或一句只有你们懂的话……"
            aria-label="这一页的故事"
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
          <small>{description.length} / 500</small>
        </label>

        {conflict ? (
          <aside className="album-editor__conflict">
            <strong>这本相册刚刚被更新过</strong>
            <p>你的草稿仍然保留。载入最新内容后，再决定如何修改。</p>
            <button onClick={loadLatest} type="button">载入最新内容</button>
          </aside>
        ) : null}
        {submitError ? <p className="album-editor__error" role="alert">{submitError}</p> : null}

        {discarding ? <div className="album-composer__discard" role="alert">
          <strong>这页还没有保存</strong><p>离开会丢失刚才填写的内容。</p>
          <div><button ref={keepRef} type="button" onClick={() => { setDiscarding(false); titleRef.current?.focus(); }}>继续填写</button><button type="button" onClick={props.onClose}>放弃修改</button></div>
        </div> : null}
        <footer>
          <span>只属于你们的共同记忆</span>
          <button disabled={saving} onClick={requestClose} type="button">取消</button>
          <button disabled={saving} type="submit">
            {saving ? '正在保存…' : props.mode === 'create' ? '创建相册' : '保存修改'}
          </button>
        </footer>
      </form>
      </div>
    </dialog>
  );
}
