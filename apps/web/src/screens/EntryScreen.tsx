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
  type Settings,
} from '@hibi/domain';
import { BedDouble, BookOpen, Check, ChevronLeft, CodeXml, Moon, StickyNote } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CelebrationToast, useCelebration } from '../components/Celebration';
import { Heatmap } from '../components/Heatmap';
import { Pot } from '../components/Pot';
import { NavButtons, SyncBadge } from '../components/TopBar';
import { Tile } from '../components/Tile';
import { formatDay, formatDayLong, formatHours, formatMinutes } from '../format';
import { useEntries, useKV, useNow, useSettings } from '../hooks';
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

function greeting(hour: number): string {
  if (hour < 5) return 'Bonne nuit';
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

/** Une phrase qui dit quoi faire ensuite, pas un état. */
function nextStep(e: Entry, score: number | null, s: Settings): string {
  if (e.off) return 'Journée off : elle ne compte ni dans le score ni dans les séries.';
  if (score === null) return 'Ta journée commence ici : un tap sur une valeur la garde.';
  if (score >= 0.9999) return 'Journée pleine. Bravo.';
  if (e.bedtime === null || e.sleepH === null) return 'Il manque ta nuit : coucher et sommeil.';
  if (e.devMin !== null && e.devMin < s.devTargetMin) return `Encore ${s.devTargetMin - e.devMin} min de dev pour l'objectif.`;
  if (e.devMin === null) return 'Il manque ton temps de dev.';
  if (!e.reading) return 'Il manque la lecture.';
  return 'Presque : coucher ou sommeil un peu juste.';
}

export function EntryScreen({ day: routeDay }: { day?: string }) {
  const now = useNow();
  const settings = useSettings();
  const username = useKV<string | null>('username', null);
  const { index, loading } = useEntries();

  const { day: today, hour } = parisNow(now);
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
  const name = username ? username.charAt(0).toUpperCase() + username.slice(1) : '';

  if (loading) return <div className="screen" />;

  return (
    <div className={`screen entry${entry.off ? ' is-off' : ''}`}>
      <header className="topbar">
        <div className="greeting">
          <h1>{name ? `${greeting(hour)} ${name}` : greeting(hour)}</h1>
          <span>{formatDayLong(day)}</span>
        </div>
        <NavButtons />
      </header>

      <div className="subbar">
        <div className="pills" role="group" aria-label="Jour saisi">
          {isPast ? (
            <button type="button" className="pill-btn active" onClick={() => goTo(openDay)}>
              <ChevronLeft size={16} aria-hidden="true" />
              {formatDay(day)}
            </button>
          ) : (
            [yesterday, today].map((d) => (
              <button
                key={d}
                type="button"
                className={`pill-btn${d === day ? ' active' : ''}`}
                aria-pressed={d === day}
                onClick={() => goTo(d)}
              >
                {d === today ? "Aujourd'hui" : 'Hier'}
              </button>
            ))
          )}
        </div>
        <SyncBadge />
      </div>

      <section className="hero" aria-label="Résumé">
        <Pot score={score} celebrate={celebration?.kind === 'perfect'} />
        <div className="hero-side">
          <p className="hero-msg">{nextStep(entry, score, settings)}</p>
          <ul className="chips" aria-label="Séries en cours">
            <li className={`chip${streaks.lecture >= 3 ? ' hot' : ''}`}>
              <b className="num">{streaks.lecture}</b> j lecture
            </li>
            <li className={`chip${streaks.dev >= 3 ? ' hot' : ''}`}>
              <b className="num">{streaks.dev}</b> j dev
            </li>
            <li className={`chip${streaks.sommeil >= 3 ? ' hot' : ''}`}>
              <b className="num">{streaks.sommeil}</b> {streaks.sommeil > 1 ? 'nuits' : 'nuit'}
            </li>
          </ul>
        </div>
      </section>

      <Heatmap
        index={index}
        settings={settings}
        today={today}
        refDay={openDay}
        onOpen={() => {
          window.location.hash = '#/historique';
        }}
      />

      <section className="controls" aria-label="Saisie">
        <div className="tiles">
          <Tile
            label="Coucher"
            icon={Moon}
            tone="lilac"
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
          <Tile
            label="Sommeil"
            icon={BedDouble}
            tone="sky"
            value={entry.sleepH}
            ghost={prevSleep ?? settings.sleepTargetH}
            ghostHint={hint(prevSleep)}
            step={0.5}
            min={0}
            max={24}
            format={formatHours}
            onChange={(v) => set({ sleepH: v })}
          />
          <Tile
            label="Dev"
            icon={CodeXml}
            tone="butter"
            value={entry.devMin}
            ghost={prevDev ?? settings.devTargetMin}
            ghostHint={hint(prevDev)}
            step={15}
            min={0}
            max={1440}
            format={formatMinutes}
            onChange={(v) => set({ devMin: v })}
            free={{ type: 'number', unit: 'min', toInput: String, fromInput: (s) => (/^\d+$/.test(s) ? Number(s) : null) }}
          />
          <button
            type="button"
            role="switch"
            aria-checked={entry.reading}
            aria-label="Lecture"
            className="read-tile"
            onClick={() => set({ reading: !entry.reading })}
          >
            <span className="field-label">
              <BookOpen size={18} aria-hidden="true" />
              Lecture
            </span>
            <span className="tick">
              <Check size={28} strokeWidth={2.6} aria-hidden="true" />
            </span>
            <b>{entry.reading ? (day === today ? "Lu aujourd'hui" : 'Lu ce jour-là') : 'Pas encore lu'}</b>
          </button>
        </div>
        <NoteAndOff entry={entry} dayKey={day} onOff={(off) => set({ off })} onNote={(note) => set({ note: note.trim() ? note : null })} />
      </section>

      <CelebrationToast celebration={celebration} />
    </div>
  );
}

function NoteAndOff({
  entry,
  dayKey,
  onOff,
  onNote,
}: {
  entry: Entry;
  dayKey: string;
  onOff: (v: boolean) => void;
  onNote: (s: string) => void;
}) {
  const [open, setOpen] = useState((entry.note ?? '') !== '');
  useEffect(() => setOpen((entry.note ?? '') !== ''), [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="extras">
        <button type="button" role="switch" aria-checked={entry.off} className="soft-btn" onClick={() => onOff(!entry.off)}>
          Journée off
        </button>
        {!open && (
          <button type="button" className="soft-btn" onClick={() => setOpen(true)}>
            <StickyNote size={16} aria-hidden="true" />
            Ajouter une note
          </button>
        )}
      </div>
      {open && <NoteField key={dayKey} initial={entry.note ?? ''} autoFocus={(entry.note ?? '') === ''} onSave={onNote} />}
    </>
  );
}

/** Note en état local, écrite 400 ms après la dernière frappe : le curseur ne saute pas. */
function NoteField({ initial, autoFocus, onSave }: { initial: string; autoFocus: boolean; onSave: (s: string) => void }) {
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

  return (
    <textarea
      className="note"
      aria-label="Note"
      placeholder="Note du jour"
      rows={2}
      maxLength={2000}
      value={text}
      autoFocus={autoFocus}
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
