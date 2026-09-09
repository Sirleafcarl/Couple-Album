import type { ClaimedJob } from '@memory/db';

type WorkerJobSource = {
  recoverStale(now: Date, staleJobMs: number): Promise<number>;
  claimNext(workerId: string, now: Date): Promise<ClaimedJob | null>;
};

type RunWorkerOptions = {
  workerId: string;
  concurrency: number;
  pollMs: number;
  staleJobMs: number;
  signal: AbortSignal;
  jobs: WorkerJobSource;
  processJob(job: ClaimedJob): Promise<unknown>;
  now?: () => Date;
  onError?: (error: unknown) => void;
};

function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function runWorker(options: RunWorkerOptions): Promise<void> {
  const currentTime = options.now ?? (() => new Date());
  const onError = options.onError ?? ((error: unknown) => console.error(error));
  await options.jobs.recoverStale(currentTime(), options.staleJobMs);

  const active = new Set<Promise<void>>();
  while (!options.signal.aborted) {
    let foundJob = false;
    while (active.size < options.concurrency && !options.signal.aborted) {
      const claimed = await options.jobs.claimNext(options.workerId, currentTime());
      if (!claimed) break;
      foundJob = true;
      let task: Promise<void>;
      task = Promise.resolve()
        .then(() => options.processJob(claimed))
        .then(() => undefined)
        .catch((error: unknown) => onError(error))
        .finally(() => active.delete(task));
      active.add(task);
    }

    if (options.signal.aborted) break;
    if (active.size >= options.concurrency || (foundJob && active.size > 0)) {
      await Promise.race(active);
    } else {
      await waitForPoll(options.pollMs, options.signal);
    }
  }

  await Promise.allSettled(active);
}
