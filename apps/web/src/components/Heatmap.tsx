import { addDays, dayScore, sevenDayScore, toPercent, type EntryIndex, type Settings } from '@hibi/domain';
import { useRef, useState } from 'react';
import { formatDay } from '../format';

const WEEKS = 18;

/** Lundi de la semaine qui contient `day`. */
function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(day, -((dow + 6) % 7));
}

function level(score: number | null): string {
  if (score === null) return '';
  if (score >= 0.9999) return 'l4';
  if (score >= 0.75) return 'l3';
  if (score >= 0.5) return 'l2';
  return 'l1';
}

/**
 * Heatmap façon GitHub : 18 semaines, une ligne par jour (lundi en haut).
 * Les cases font ~14 px, trop petites pour viser au doigt : un tap ouvre l'historique,
 * un appui long sur une case affiche sa date et son score.
 */
export function Heatmap({
  index,
  settings,
  today,
  refDay,
  onOpen,
}: {
  index: EntryIndex;
  settings: Settings;
  today: string;
  refDay: string;
  onOpen: () => void;
}) {
  const start = addDays(mondayOf(today), -(WEEKS - 1) * 7);
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const day = addDays(start, i);
    if (day > today) return { day, cls: 'future', label: '' };
    const e = index.get(day);
    if (e?.off) return { day, cls: 'off', label: 'off' };
    const s = dayScore(e, settings);
    return { day, cls: level(s), label: s === null ? 'non saisi' : `${toPercent(s)} %` };
  });
  const week = sevenDayScore(index, refDay, settings);

  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressed = useRef(false);
  const root = useRef<HTMLButtonElement>(null);

  const startPress = (ev: React.PointerEvent) => {
    longPressed.current = false;
    const cell = (ev.target as HTMLElement).closest<HTMLElement>('[data-day]');
    if (!cell || !root.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = cell.getBoundingClientRect();
      const o = root.current!.getBoundingClientRect();
      longPressed.current = true;
      setTip({ text: `${formatDay(cell.dataset.day!)} : ${cell.dataset.label}`, x: r.left - o.left + r.width / 2, y: r.top - o.top });
      navigator.vibrate?.(10);
    }, 400);
  };
  const endPress = () => {
    clearTimeout(timer.current);
    if (longPressed.current) setTimeout(() => setTip(null), 1400);
  };

  return (
    <button
      ref={root}
      type="button"
      className="heat"
      aria-label={`Activité des ${WEEKS} dernières semaines. Ouvrir l'historique.`}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onOpen();
      }}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="heat-head">
        <span>{WEEKS} dernières semaines</span>
        <span>
          7 derniers jours : <b className="num">{week === null ? '—' : `${toPercent(week)} %`}</b>
        </span>
      </span>
      <span className="heat-body" aria-hidden="true">
        <span className="heat-days">
          <span>L</span>
          <span />
          <span>M</span>
          <span />
          <span>V</span>
          <span />
          <span>D</span>
        </span>
        <span className="heat-grid">
          {cells.map((c) => (
            <span
              key={c.day}
              className={`heat-cell ${c.cls}${c.day === today ? ' today' : ''}`}
              data-day={c.cls === 'future' ? undefined : c.day}
              data-label={c.label}
            />
          ))}
        </span>
      </span>
      {tip && (
        <span className="heat-tip" style={{ left: tip.x, top: tip.y }} role="status">
          {tip.text}
        </span>
      )}
    </button>
  );
}
