import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelationshipTimer } from '../album-wall/relationship-timer.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('relationship timer', () => {
  it('updates the quiet clock every second without announcing every tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T01:02:03+08:00'));
    render(<RelationshipTimer startedAt={new Date('2026-09-01T00:00:00+08:00')} />);

    expect(screen.getByLabelText('相伴天数')).toHaveTextContent('2');
    expect(screen.getByLabelText('相伴天数')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText('相伴时分秒')).toHaveTextContent('01:02:03');
    expect(screen.getByLabelText('相伴时分秒')).not.toHaveAttribute('aria-live');

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByLabelText('相伴时分秒')).toHaveTextContent('01:02:04');
  });
});
