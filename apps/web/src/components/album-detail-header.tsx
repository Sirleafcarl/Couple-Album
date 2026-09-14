import type { AlbumLayout } from '@memory/contracts/albums';
import './album-detail-header.css';
const layouts: Array<[AlbumLayout, string]> = [['story', '故事书'], ['garden', '花园']];

export function visibleAlbumLayout(layout: AlbumLayout): 'story' | 'garden' {
  return layout === 'garden' ? 'garden' : 'story';
}

export function AlbumDetailHeader({ title, date, description, layout, busy, sorting, onUpload, onLibrary, onSort, onLayout }: {
  title: string; date: string; description: string; layout: AlbumLayout; busy: boolean; sorting: boolean;
  onUpload(): void; onLibrary(): void; onSort(): void; onLayout(layout: AlbumLayout): void;
}) {
  return <header className="album-detail-header">
    <div className="album-detail-header__identity"><div><h1>{title}</h1><time dateTime={date}>{date.replaceAll('-', '.')}</time></div>
      {description.trim() ? <p>{description}</p> : null}
    </div>
    <div className="album-detail-header__tools">
      <div className="album-detail-header__actions">
        <button type="button" className="album-detail-header__upload" onClick={onUpload}>添加照片</button>
        <button type="button" aria-haspopup="dialog" onClick={onLibrary}>从照片库挑选</button>
        <button type="button" aria-pressed={sorting} onClick={onSort}>{sorting ? '完成整理' : '整理'}</button>
      </div>
      <div className="album-detail-header__layouts" role="group" aria-label="照片墙布局">
        <span>呈现方式</span>{layouts.map(([value, label]) => <button type="button" key={value} disabled={busy} aria-pressed={visibleAlbumLayout(layout) === value} onClick={() => visibleAlbumLayout(layout) !== value && onLayout(value)}>{label}</button>)}
      </div>
    </div>
  </header>;
}
