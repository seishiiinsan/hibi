import { addDays, dayScore, scoreColor, sevenDayScore, toPercent, type EntryIndex, type Settings } from '@hibi/domain';
import { Coffee } from 'lucide-react';

const letter = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow', timeZone: 'UTC' });

/** Les 7 derniers jours en un coup d'œil, sans tap : chaque pastille ouvre sa journée. */
export function WeekStrip({
  index,
  settings,
  endDay,
  activeDay,
  onOpen,
}: {
  index: EntryIndex;
  settings: Settings;
  endDay: string;
  activeDay: string;
  onOpen: (day: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(endDay, i - 6));
  const week = sevenDayScore(index, endDay, settings);
  return (
    <section className="card week" aria-label="7 derniers jours">
      <div className="week-head">
        <span>7 derniers jours</span>
        <span>
          moyenne <b className="num">{week === null ? '—' : `${toPercent(week)} %`}</b>
        </span>
      </div>
      <div className="week-days">
        {days.map((d) => {
          const e = index.get(d);
          const s = dayScore(e, settings);
          const name = letter.format(new Date(`${d}T00:00:00Z`));
          return (
            <button
              key={d}
              type="button"
              className={`week-day${d === activeDay ? ' active' : ''}`}
              onClick={() => onOpen(d)}
              aria-label={`${d} : ${e?.off ? 'Off' : s === null ? 'non saisi' : `${toPercent(s)} %`}`}
            >
              <span
                className={`week-dot${e?.off ? ' off' : s !== null ? ' filled' : ''}`}
                style={s !== null && !e?.off ? { background: scoreColor(s) } : undefined}
              >
                {e?.off && <Coffee size={14} />}
              </span>
              {name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
