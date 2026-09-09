import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RedThread } from '../album-wall/red-thread.js';
import { getCorridorMetrics } from '../album-wall/corridor-metrics.js';
afterEach(cleanup);
it('extends the red thread to both scene edges even for one album', () => {
  const { anchors } = getCorridorMetrics(1, 1100);
  const { container } = render(<RedThread anchors={anchors} width={1100} height={680} />);
  const path = container.querySelector('.red-thread__line')!.getAttribute('d');
  expect(path).toMatch(/^M 0 /);
  expect(path).toContain('1100');
  expect(path).toContain(`${anchors[0]!.x} ${anchors[0]!.threadY}`);
});
