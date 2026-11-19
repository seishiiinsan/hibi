import type { Entry, Settings } from './types.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Format exact de Date#toISOString : la comparaison lexicographique côté SQL reste alors chronologique.
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isValidDay(s: unknown): s is string {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const isValidHHMM = (s: unknown): s is string => typeof s === 'string' && HHMM_RE.test(s);

export function isValidIsoUtc(s: unknown): s is string {
  return typeof s === 'string' && ISO_UTC_RE.test(s) && !Number.isNaN(Date.parse(s));
}

const isFiniteNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Renvoie la liste des erreurs (vide si l'entrée est valide). */
export function validateEntry(e: Entry): string[] {
  const errors: string[] = [];
  if (!isValidDay(e.day)) errors.push('day');
  if (typeof e.off !== 'boolean') errors.push('off');
  if (e.bedtime !== null && !isValidHHMM(e.bedtime)) errors.push('bedtime');
  if (e.sleepH !== null && !(isFiniteNum(e.sleepH) && e.sleepH >= 0 && e.sleepH <= 24)) errors.push('sleepH');
  if (e.devMin !== null && !(Number.isInteger(e.devMin) && e.devMin >= 0 && e.devMin <= 24 * 60)) errors.push('devMin');
  if (typeof e.reading !== 'boolean') errors.push('reading');
  if (e.note !== null && (typeof e.note !== 'string' || e.note.length > 2000)) errors.push('note');
  if (!isValidIsoUtc(e.updatedAt)) errors.push('updatedAt');
  return errors;
}

export function validateSettings(s: Settings): string[] {
  const errors: string[] = [];
  if (!isValidHHMM(s.bedtimeTarget)) errors.push('bedtimeTarget');
  if (!(isFiniteNum(s.bedtimeToleranceH) && s.bedtimeToleranceH > 0 && s.bedtimeToleranceH <= 12)) errors.push('bedtimeToleranceH');
  if (!(isFiniteNum(s.sleepTargetH) && s.sleepTargetH > 0 && s.sleepTargetH <= 24)) errors.push('sleepTargetH');
  if (!(Number.isInteger(s.devTargetMin) && s.devTargetMin > 0 && s.devTargetMin <= 24 * 60)) errors.push('devTargetMin');
  const w = s.weights;
  const ws = w ? [w.bedtime, w.sleep, w.dev, w.reading] : [];
  if (ws.length !== 4 || !ws.every((x) => isFiniteNum(x) && x >= 0 && x <= 100) || ws.reduce((a, b) => a + b, 0) <= 0) {
    errors.push('weights');
  }
  return errors;
}
