import { dayScore, toPercent } from './score.js';
import type { Entry, Settings } from './types.js';

const cell = (v: string | number | null): string => {
  if (v === null) return '';
  const s = String(v);
  // Échappement RFC 4180 + neutralisation des formules (=, +, -, @) à l'ouverture dans un tableur.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function entriesToCsv(entries: readonly Entry[], s: Settings): string {
  const header = ['jour', 'off', 'coucher', 'sommeil_h', 'dev_min', 'lecture', 'score_pct', 'note', 'maj_utc'];
  const rows = [...entries]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((e) => {
      const score = dayScore(e, s);
      return [
        e.day,
        e.off ? 1 : 0,
        e.bedtime,
        e.sleepH,
        e.devMin,
        e.reading ? 1 : 0,
        score === null ? null : toPercent(score),
        e.note,
        e.updatedAt,
      ]
        .map(cell)
        .join(',');
    });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
