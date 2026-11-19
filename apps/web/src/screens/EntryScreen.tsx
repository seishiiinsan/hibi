import {
  addDays,
  blankEntry,
  dayScore,
  defaultDay,
  hhmmToMinutes,
  minutesToHHMM,
  parisNow,
  streak,
  type Entry,
  type EntryIndex,
} from '@hibi/domain';
import { BedDouble, BookOpen, ChevronLeft, CodeXml, Coffee, Flame, Moon, Sparkles, StickyNote, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CelebrationToast, useCelebration } from '../components/Celebration';
import { ScoreRing } from '../components/ScoreRing';
import { Stepper } from '../components/Stepper';
import { Toggle } from '../components/Toggle';
import { TopBar } from '../components/TopBar';
import { WeekStrip } from '../components/WeekStrip';
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
  const { entries, index, loading } = useEntries();

  const today = parisNow(now).day;
  const yesterday = addDays(today, -1);
  const openDay = defaultDay(now);
  const day = routeDay ?? openDay;
  const entry = index.get(day) ?? blankEntry(day);
  const set = (patch: Partial<Entry>) => void updateEntry(day, patch);

  const score = dayScore(index.get(day), settings);
  const streaks = useMemo(
    () => ({
      lecture: streak(index, 'reading', openDay, settings),
      dev: streak(index, 'dev', openDay, settings),
      sommeil: streak(index, 'sleep', openDay, settings),
    }),
    [index, openDay, settings],
  );
  const celebration = useCelebration(!loading, day, score, streaks);

  const prevBedtime = previousValue(index, day, 'bedtime');
  const prevSleep = previousValue(index, day, 'sleepH');
  const prevDev = previousValue(index, day, 'devMin');
  const hint = (prev: unknown) => (prev === null ? 'objectif' : 'comme la veille');

  const goTo = (d: string) => {
    window.location.hash = d === openDay ? '#/' : `#/jour/${d}`;
  };
  const isPast = day !== today && day !== yesterday;

  if (loading) return <div className="screen" />;

  return (
    <div className={`screen entry${entry.off ? ' is-off' : ''}`}>
      <CelebrationToast celebration={celebration} />
      <TopBar />

      <div className="segmented" role="group" aria-label="Jour saisi">
        {isPast ? (
          <button type="button" className="segment active segment-back" onClick={() => goTo(openDay)}>
            <ChevronLeft size={18} aria-hidden="true" />
            {formatDayLong(day)}
          </button>
        ) : (
          [yesterday, today].map((d) => (
            <button
              key={d}
              type="button"
              className={`segment${d === day ? ' active' : ''}`}
              aria-pressed={d === day}
              onClick={() => goTo(d)}
            >
              {d === today ? "Aujourd'hui" : 'Hier'}
              <small>{formatDay(d)}</small>
            </button>
          ))
        )}
      </div>

      <section className="card hero" aria-label="Résumé">
        <ScoreRing score={score} celebrate={celebration?.kind === 'perfect'} />
        <div className="hero-side">
          <span className="hero-title">{entry.off ? 'Journée Off' : formatDayLong(day)}</span>
          <ul className="streaks" aria-label="Séries en cours">
            <StreakChip icon={BookOpen} value={streaks.lecture} label="lecture" />
            <StreakChip icon={CodeXml} value={streaks.dev} label="dev" />
            <StreakChip icon={BedDouble} value={streaks.sommeil} label="sommeil" />
          </ul>
        </div>
      </section>

      {entries && entries.length === 0 ? (
        <section className="card empty" aria-label="Premiers pas">
          <span className="empty-icon">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>Première journée</strong>
            <p>Les valeurs en pointillés sont des propositions : un tap les valide, − et + les ajustent.</p>
          </div>
        </section>
      ) : (
        <WeekStrip index={index} settings={settings} endDay={openDay} activeDay={day} onOpen={goTo} />
      )}

      <section className="card controls" aria-label="Saisie">
        <p className="controls-hint">Dev et lecture du jour · coucher et sommeil de la nuit</p>
        <Stepper
          label="Coucher"
          icon={Moon}
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
          icon={BedDouble}
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
          icon={CodeXml}
          value={entry.devMin}
          ghost={prevDev ?? settings.devTargetMin}
          ghostHint={hint(prevDev)}
          step={15}
          min={0}
          max={1440}
          format={formatMinutes}
          onChange={(v) => set({ devMin: v })}
          free={{ type: 'number', toInput: String, fromInput: (s) => (/^\d+$/.test(s) ? Number(s) : null) }}
        />
        <div className="toggles">
          <Toggle label="Lecture" icon={BookOpen} checked={entry.reading} onChange={(reading) => set({ reading })} />
          <Toggle label="Off" icon={Coffee} variant="muted" checked={entry.off} onChange={(off) => set({ off })} />
        </div>
        <NoteField key={day} initial={entry.note ?? ''} onSave={(note) => set({ note: note.trim() ? note : null })} />
      </section>
    </div>
  );
}

function StreakChip({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  const hot = value >= 3;
  return (
    <li className={`streak${hot ? ' hot' : ''}`}>
      <span className="streak-top">
        {hot ? <Flame size={14} aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}
        <span className="streak-value num">{value}</span>
      </span>
      <span className="streak-label">{label}</span>
    </li>
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
        <StickyNote size={16} aria-hidden="true" />
        Ajouter une note
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
