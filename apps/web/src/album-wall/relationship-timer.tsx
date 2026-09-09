import { useEffect, useState } from 'react';
import { getRelationshipDuration } from './relationship-duration.js';

export function RelationshipTimer({ startedAt }: { startedAt: Date }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const duration = getRelationshipDuration(startedAt, now);
  const clock = [duration.hours, duration.minutes, duration.seconds]
    .map((unit) => String(unit).padStart(2, '0'))
    .join(':');

  return (
    <section className="relationship-timer" aria-label="我们在一起的时间">
      <p className="relationship-timer__label">我们在一起</p>
      <div
        aria-label="相伴天数"
        aria-live="polite"
        className="relationship-timer__calendar"
        data-day={duration.totalDays}
      >
        <strong>{duration.totalDays}</strong>
        <span>天</span>
      </div>
      <time aria-label="相伴时分秒" className="relationship-timer__clock">
        {clock}
      </time>
    </section>
  );
}
