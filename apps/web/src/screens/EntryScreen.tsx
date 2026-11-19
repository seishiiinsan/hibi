import {
  addDays,
  blankEntry,
  dayScore,
  defaultDay,
  hhmmToMinutes,
  minutesToHHMM,
  parisNow,
  sevenDayScore,
  streak,
  type Entry,
  type EntryIndex,
} from '@hibi/domain';
import { useEffect, useRef, useState } from 'react';
import { ScoreBadge } from '../components/ScoreBadge';
import { Stepper } from '../components/Stepper';
import { Toggle } from '../components/Toggle';
import { TopBar } from '../components/TopBar';
import { formatDay, formatDayLong, formatHours, formatMinutes } from '../format';
import { useEntries, useNow, useSettings } from '../hooks';
import { updateEntry } from '../sync';

type Field = 'bedtime' | 'sleepH' | 'devMin';

/** Valeur de la veille (ENF-01), en remontant jusqu'à 7 jours si la veille est vide ou Off. */
function previousValue<F extends Field>(index: EntryIndex, day: string, field: F): Entry[F] {
  for (let i = 1; i <= 7; i++) {
    const e = index.get(addDays(day, -i));
    if (e && !e.off && e[field] !== null) return e[field];
  }
  return null;
}

export function EntryScreen({ day: routeDay }: { day?: string }) {
  const now = useNow();
  const settings = useSettings();
  const { index, loading } = useEntries();

  const today = parisNow(now).day;
  const yesterday = addDays(today, -1);
  const openDay = defaultDay(now);
  const day = routeDay ?? openDay;
  const entry = index.get(day) ?? blankEntry(day);
  const set = (patch: Partial<Entry>) => void updateEntry(day, patch);

  const prevBedtime = previousValue(index, day, 'bedtime');
  const prevSleep = previousValue(index, day, 'sleepH');
  const prevDev = previousValue(index, day, 'devMin');
  const hint = (prev: unknown) => (prev === null ? 'objectif' : 'comme la veille');

  const goTo = (d: string) => {
    window.location.hash = d === openDay ? '#/' : `#/jour/${d}`;
  };
  const isPast = day !== today && day !== yesterday;
  const score = dayScore(index.get(day), settings);
  const week = sevenDayScore(index, openDay, settings);

  if (loading) return <div className="screen" />;

  return (
    <div className={`screen entry${entry.off ? ' is-off' : ''}`}>
      <header className="entry-head">
        <TopBar />
        <div className="day-switch" role="group" aria-label="Jour saisi">
          {isPast ? (
            <button type="button" className="day-btn active" onClick={() => goTo(openDay)}>
              ‹ {formatDay(day)}
            </button>
          ) : (
            [yesterday, today].map((d) => (
              <button
                key={d}
                type="button"
                className={`day-btn${d === day ? ' active' : ''}`}
                aria-pressed={d === day}
                onClick={() => goTo(d)}
              >
                {d === today ? "Aujourd'hui" : 'Hier'}
                <small>{formatDay(d)}</small>
              </button>
            ))
          )}
        </div>
        <div className="summary">
          <div className="summary-score">
            <ScoreBadge score={score} />
            <span className="summary-caption">{formatDayLong(day)}</span>
          </div>
          <ul className="streaks" aria-label="Séries en cours">
            <li>
              <b>{streak(index, 'reading', openDay, settings)}</b> lecture
            </li>
            <li>
              <b>{streak(index, 'dev', openDay, settings)}</b> dev
            </li>
            <li>
              <b>{streak(index, 'sleep', openDay, settings)}</b> sommeil
            </li>
            <li>
              <ScoreBadge score={week} size="sm" /> 7 j
            </li>
          </ul>
        </div>
      </header>

      <section className="controls" aria-label="Saisie">
        <p className="controls-hint">
          Ligne du {formatDay(day)} : dev et lecture de ce jour, coucher et sommeil de la nuit suivante.
        </p>
        <Stepper
          label="Coucher"
          value={entry.bedtime === null ? null : hhmmToMinutes(entry.bedtime)}
          ghost={hhmmToMinutes(prevBedtime ?? settings.bedtimeTarget)}
          ghostHint={hint(prevBedtime)}
          step={15}
          min={0}
          max={1440}
          wrap
          format={minutesToHHMM}
          onChange={(v) => set({ bedtime: v === null ? null : minutesToHHMM(v) })}
          free={{ type: 'time', toInput: minutesToHHMM, fromInput: (s) => (s ? hhmmToMinutes(s) : null) }}
        />
        <Stepper
          label="Sommeil"
          value={entry.sleepH}
          ghost={prevSleep ?? settings.sleepTargetH}
          ghostHint={hint(prevSleep)}
          step={0.5}
          min={0}
          max={24}
          format={formatHours}
          onChange={(v) => set({ sleepH: v })}
        />
        <Stepper
          label="Dev"
          value={entry.devMin}
          ghost={prevDev ?? settings.devTargetMin}
          ghostHint={hint(prevDev)}
          step={15}
          min={0}
          max={1440}
          format={formatMinutes}
          onChange={(v) => set({ devMin: v })}
          free={{
            type: 'number',
            toInput: String,
            fromInput: (s) => (/^\d+$/.test(s) ? Number(s) : null),
          }}
        />
        <div className="toggles">
          <Toggle label="Lecture" checked={entry.reading} onChange={(reading) => set({ reading })} />
          <Toggle label="Off" variant="muted" checked={entry.off} onChange={(off) => set({ off })} />
        </div>
        <NoteField key={day} initial={entry.note ?? ''} onSave={(note) => set({ note: note.trim() ? note : null })} />
      </section>
    </div>
  );
}

/** Note en état local, écrite 400 ms après la dernière frappe : le curseur ne saute pas. */
function NoteField({ initial, onSave }: { initial: string; onSave: (s: string) => void }) {
  const [open, setOpen] = useState(initial !== '');
  const [text, setText] = useState(initial);
  const saved = useRef(initial);
  const save = useRef(onSave);
  save.current = onSave;

  useEffect(() => {
    if (text === saved.current) return;
    const t = setTimeout(() => {
      saved.current = text;
      save.current(text);
    }, 400);
    return () => clearTimeout(t);
  }, [text]);

  if (!open) {
    return (
      <button type="button" className="note-open" onClick={() => setOpen(true)}>
        + Note
      </button>
    );
  }
  return (
    <textarea
      className="note"
      aria-label="Note"
      placeholder="Note du jour"
      rows={2}
      maxLength={2000}
      value={text}
      autoFocus={initial === ''}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== saved.current) {
          saved.current = text;
          save.current(text);
        }
      }}
    />
  );
}
