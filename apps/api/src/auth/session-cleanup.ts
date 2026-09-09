import type { SessionRepository } from '@memory/db';

export function startSessionCleanup(
  sessions: SessionRepository,
  clock: () => Date = () => new Date(),
  intervalMs = 60 * 60 * 1000,
): () => void {
  const timer = setInterval(() => {
    void sessions.deleteExpired(clock()).catch((error: unknown) => {
      console.error('Failed to clean expired sessions', error);
    });
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
