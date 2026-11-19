import { hhmmToMinutes } from './time.js';
import { CRITERIA, type Criterion, type Entry, type Settings } from './types.js';

const EPS = 1e-9;

/** Retard en heures, ramené dans [-12 h ; 12 h[ pour gérer minuit. Négatif = en avance. */
export function bedtimeDelayH(bedtime: string, target: string): number {
  const diffH = (hhmmToMinutes(bedtime) - hhmmToMinutes(target)) / 60;
  return ((((diffH + 12) % 24) + 24) % 24) - 12;
}

export function bedtimeScore(bedtime: string, s: Settings): number {
  const delay = bedtimeDelayH(bedtime, s.bedtimeTarget);
  if (delay <= 0) return 1;
  return Math.max(0, 1 - delay / s.bedtimeToleranceH);
}

export const sleepScore = (hours: number, s: Settings): number => Math.min(1, hours / s.sleepTargetH);
export const devScore = (minutes: number, s: Settings): number => Math.min(1, minutes / s.devTargetMin);

export type CriterionScores = Record<Criterion, number | null>;

/** Score de chaque critère ; null = non saisi. La lecture vaut 0 tant qu'elle n'est pas cochée. */
export function criterionScores(e: Entry, s: Settings): CriterionScores {
  return {
    bedtime: e.bedtime === null ? null : bedtimeScore(e.bedtime, s),
    sleep: e.sleepH === null ? null : sleepScore(e.sleepH, s),
    dev: e.devMin === null ? null : devScore(e.devMin, s),
    reading: e.reading ? 1 : 0,
  };
}

/**
 * Score du jour (0 à 1) : Σ(score × poids) / Σ poids sur les critères saisis.
 * null si Off, si la journée n'existe pas, ou si ni coucher, ni sommeil, ni dev n'est saisi.
 */
export function dayScore(e: Entry | undefined, s: Settings): number | null {
  if (!e || e.off) return null;
  if (e.bedtime === null && e.sleepH === null && e.devMin === null) return null;
  const scores = criterionScores(e, s);
  let num = 0;
  let den = 0;
  for (const c of CRITERIA) {
    const v = scores[c];
    if (v === null) continue;
    num += v * s.weights[c];
    den += s.weights[c];
  }
  return den === 0 ? null : num / den;
}

/** Critère atteint = score du critère égal à 1. */
export function isAchieved(e: Entry, c: Criterion, s: Settings): boolean {
  const v = criterionScores(e, s)[c];
  return v !== null && v >= 1 - EPS;
}

/** Arrondi d'affichage en pourcentage entier. */
export const toPercent = (score: number): number => Math.round(score * 100);
