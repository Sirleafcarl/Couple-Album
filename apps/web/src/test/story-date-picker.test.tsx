import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StoryDatePicker } from '../components/story-date-picker.js';
beforeEach(() => vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Harness() { const [value, setValue] = useState('2026-09-08'); return <StoryDatePicker value={value} onChange={setValue} />; }
it('selects a day and closes the calendar', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: '打开日历' }));
  await userEvent.click(screen.getByRole('button', { name: '2026年9月12日' }));
  expect(screen.getByLabelText('发生日期')).toHaveValue('2026/09/12');
  expect(screen.queryByRole('region', { name: '选择发生日期' })).not.toBeInTheDocument();
});
it('supports month navigation and leap days', async () => {
  render(<StoryDatePicker value="2024-03-01" onChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: '打开日历' }));
  await userEvent.click(screen.getByRole('button', { name: '上个月' }));
  expect(screen.getByRole('button', { name: '2024年2月29日' })).toBeInTheDocument();
});
it('consumes Escape without closing the parent and restores the opener', async () => {
  const parent = vi.fn();
  render(<div onKeyDown={parent}><Harness /></div>);
  await userEvent.click(screen.getByRole('button', { name: '打开日历' }));
  parent.mockClear();
  await userEvent.keyboard('{Escape}');
  expect(parent).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '打开日历' })).toHaveFocus();
});
it('jumps to a chosen year and month without changing the selected date until a day is chosen', async () => {
  const change = vi.fn();
  render(<StoryDatePicker value="2026-09-08" onChange={change} />);
  await userEvent.click(screen.getByRole('button', { name: '打开日历' }));
  await userEvent.click(screen.getByRole('button', { name: '选择年月' }));
  await userEvent.clear(screen.getByLabelText('日历年份'));
  await userEvent.type(screen.getByLabelText('日历年份'), '2024');
  await userEvent.click(screen.getByRole('button', { name: '2月' }));
  expect(change).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '2024年2月29日' }));
  expect(change).toHaveBeenCalledWith('2024-02-29');
});
it('moves keyboard focus across a month boundary and selects with Enter', async () => {
  const change = vi.fn();
  render(<StoryDatePicker value="2024-03-01" onChange={change} />);
  await userEvent.click(screen.getByRole('button', { name: '打开日历' }));
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByRole('button', { name: '2024年2月29日' })).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(change).toHaveBeenCalledWith('2024-02-29');
});
