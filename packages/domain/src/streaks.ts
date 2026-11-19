import { dayScore, isAchieved } from './score.js';
import { addDays } from './time.js';
import type { Criterion, Entry, Settings } from './types.js';

export type EntryIndex = ReadonlyMap<string, Entry>;

export function indexEntries(entries: Iterable<Entry>): Map<string, Entry> {
  const m = new Map<string, Entry>();
  for (const e of entries) m.set(e.day, e);
  return m;
}

/**
 * Série d'un critère vue depuis `refDay` (la ligne ouverte par défaut, EF-02) :
 * jours non-Off consécutifs où le critère est atteint jusqu'à la veille de refDay,
 * + refDay s'il est déjà atteint. Un jour Off est ignoré ; un jour non saisi la casse.
 * Pas de joker : identique au Sheet (le joker ne vaut que pour les récompenses).
 */
export function streak(index: EntryIndex, c: Criterion, refDay: string, s: Settings): number {
  let n = 0;
  const ref = index.get(refDay);
  if (ref && !ref.off && isAchieved(ref, c, s)) n++;
  for (let d = addDays(refDay, -1); ; d = addDays(d, -1)) {
    const e = index.get(d);
    if (!e) break;
    if (e.off) continue;
    if (!isAchieved(e, c, s)) break;
    n++;
  }
  return n;
}

/** Moyenne des scores non vides des 7 derniers jours (refDay inclus) ; null si aucun. */
export function sevenDayScore(index: EntryIndex, refDay: string, s: Settings): number | null {
  const scores: number[] = [];
  for (let i = 0; i < 7; i++) {
    const v = dayScore(index.get(addDays(refDay, -i)), s);
    if (v !== null) scores.push(v);
  }
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}
