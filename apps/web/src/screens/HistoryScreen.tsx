import { addDays, dayScore, parisNow } from '@hibi/domain';
import { ScoreBadge } from '../components/ScoreBadge';
import { TopBar } from '../components/TopBar';
import { formatDay, formatHours, formatMinutes } from '../format';
import { useEntries, useNow, useSettings } from '../hooks';

export function HistoryScreen() {
  const now = useNow();
  const settings = useSettings();
  const { index } = useEntries();
  const today = parisNow(now).day;
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -i));

  return (
    <div className="screen">
      <TopBar title="30 derniers jours" />
      <ul className="history">
        {days.map((day) => {
          const e = index.get(day);
          const parts = e?.off
            ? ['Off']
            : e
              ? [
                  e.bedtime,
                  e.sleepH === null ? null : formatHours(e.sleepH),
                  e.devMin === null ? null : formatMinutes(e.devMin),
                  e.reading ? 'lu' : null,
                ].filter((x): x is string => x !== null)
              : [];
          return (
            <li key={day}>
              <a href={`#/jour/${day}`} className="history-row">
                <span className="history-day">{formatDay(day)}</span>
                <span className="history-detail">{parts.length ? parts.join(' · ') : 'non saisi'}</span>
                <ScoreBadge score={dayScore(e, settings)} size="sm" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
