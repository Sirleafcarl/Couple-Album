import './photo-selection-bar.css';

export function PhotoSelectionBar({ selected, loaded, busy, onSelect, onClear }: {
  selected: number; loaded: number; busy: boolean; onSelect(): void; onClear(): void;
}) {
  return <div className="photo-selection-bar" role="group" aria-label="批量选择">
    <span role="status">已选 {selected} / 100 张</span>
    <button disabled={busy || !loaded || selected >= 100} onClick={onSelect}>全选已加载</button>
    <button disabled={busy || !selected} onClick={onClear}>取消选择</button>
    <small>仅选择已加载的 {loaded} 张{loaded > 100 ? '，每次最多 100 张' : ''}</small>
  </div>;
}
