import { useEffect, useLayoutEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDateSchema } from '@memory/contracts/albums';
import './story-date-picker.css';

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parse(value: string) {
  return CalendarDateSchema.safeParse(value).success ? new Date(`${value}T12:00:00`) : new Date();
}
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

export function StoryDatePicker({ value, onChange, disabled = false, invalid = false, errorId }: {
  value: string; onChange(value: string): void; disabled?: boolean; invalid?: boolean; errorId?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parse(value));
  const [focused, setFocused] = useState(() => iso(parse(value)));
  const [jumping, setJumping] = useState(false);
  const [yearText, setYearText] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const today = iso(new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();

  function close() { setOpen(false); setJumping(false); trigger.current?.focus(); }
  function select(date: string) { onChange(date); close(); }
  function show() { const date = parse(value); setMonth(date); setFocused(iso(date)); setOpen(true); }
  function moveMonth(delta: number) {
    const date = new Date(year, monthIndex + delta, 1, 12);
    if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return;
    setMonth(date); setFocused(iso(date));
  }
  useEffect(() => {
    if (open && !jumping) panel.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus({ preventScroll: true });
  }, [open, focused, jumping]);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const calendar = panel.current;
      const field = root.current?.getBoundingClientRect();
      if (!calendar || !field) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const margin = 12;
      calendar.style.width = `${Math.min(340, width - margin * 2)}px`;
      calendar.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
      const panelHeight = calendar.getBoundingClientRect().height;
      const below = field.bottom + 8;
      const above = field.top - panelHeight - 8;
      const preferred = below + panelHeight <= top + height - margin ? below : above;
      calendar.style.left = `${Math.max(left + margin, Math.min(field.left, left + width - calendar.offsetWidth - margin))}px`;
      calendar.style.top = `${Math.max(top + margin, Math.min(preferred, top + height - panelHeight - margin))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setJumping(false); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function onDayKey(event: KeyboardEvent<HTMLButtonElement>, day: number) {
    const shifts: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const date = new Date(year, monthIndex, day, 12);
    if (event.key in shifts) date.setDate(day + shifts[event.key]!);
    else if (event.key === 'Home') date.setDate(day - (date.getDay() + 6) % 7);
    else if (event.key === 'End') date.setDate(day + 6 - (date.getDay() + 6) % 7);
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault(); moveMonth(event.key === 'PageUp' ? -1 : 1); return;
    } else return;
    event.preventDefault();
    if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return;
    setMonth(date); setFocused(iso(date));
  }

  return <div ref={root} className="story-date" onKeyDownCapture={(event) => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setOpen(false); setJumping(false); } }}>
    <div className="story-date__field">
      <input aria-label="发生日期" aria-required="true" aria-invalid={invalid} aria-describedby={errorId} disabled={disabled}
        placeholder="YYYY/MM/DD" value={value.replaceAll('-', '/')} onChange={(event) => onChange(event.target.value.replaceAll('/', '-'))} />
      <button ref={trigger} type="button" aria-label={open ? '收起日历' : '打开日历'} aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => open ? close() : show()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 5h14v15H5zM8 3v4m8-4v4M5 10h14" /></svg>
      </button>
    </div>
    {open ? <div ref={panel} id={id} className="story-date__calendar" role="region" aria-label="选择发生日期">
      <header className="story-date__heading">
        <button type="button" aria-label="上个月" disabled={year === 1000 && monthIndex === 0} onClick={() => moveMonth(-1)}>‹</button>
        <button type="button" aria-label="选择年月" aria-expanded={jumping} onClick={() => { setYearText(String(year)); setJumping(!jumping); }}>{year}年 <strong>{monthIndex + 1}月</strong><span aria-hidden="true">⌄</span></button>
        <button type="button" aria-label="下个月" disabled={year === 9999 && monthIndex === 11} onClick={() => moveMonth(1)}>›</button>
      </header>
      {jumping ? <div className="story-date__jump">
        <label>年份<input aria-label="日历年份" type="number" min={1000} max={9999} value={yearText} onChange={(event) => setYearText(event.target.value)} /></label>
        <div>{Array.from({ length: 12 }, (_, index) => <button type="button" key={index} disabled={!/^\d{4}$/.test(yearText) || Number(yearText) < 1000} onClick={() => { const date = new Date(Number(yearText), index, 1, 12); setMonth(date); setFocused(iso(date)); setJumping(false); }}>{index + 1}月</button>)}</div>
      </div> : <>
        <div className="story-date__week" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="story-date__days">
          {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const date = iso(new Date(year, monthIndex, day, 12));
            return <button key={date} type="button" data-date={date} aria-label={`${year}年${monthIndex + 1}月${day}日`}
              aria-pressed={date === value} aria-current={date === today ? 'date' : undefined} tabIndex={date === focused ? 0 : -1}
              onFocus={() => setFocused(date)} onKeyDown={(event) => onDayKey(event, day)} onClick={() => select(date)}>{day}</button>;
          })}
        </div>
      </>}
      <div className="story-date__bottom"><span>把这一天，留在故事里</span><button type="button" onClick={() => { const date = new Date(); setMonth(date); setFocused(iso(date)); setJumping(false); }}>回到今天</button></div>
    </div> : null}
  </div>;
}
