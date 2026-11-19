/** Une ligne datée J : dev et lecture du jour J, coucher et sommeil de la nuit de J à J+1. */
export interface Entry {
  day: string; // 'YYYY-MM-DD'
  off: boolean;
  bedtime: string | null; // 'HH:MM'
  sleepH: number | null;
  devMin: number | null;
  reading: boolean;
  note: string | null;
  updatedAt: string; // ISO 8601 UTC, toujours suffixé Z
}

export interface Weights {
  bedtime: number;
  sleep: number;
  dev: number;
  reading: number;
}

export interface Settings {
  bedtimeTarget: string; // 'HH:MM'
  bedtimeToleranceH: number;
  sleepTargetH: number;
  devTargetMin: number;
  weights: Weights;
}

export type Criterion = keyof Weights;
export const CRITERIA: readonly Criterion[] = ['bedtime', 'sleep', 'dev', 'reading'];

export const DEFAULT_SETTINGS: Settings = {
  bedtimeTarget: '00:00',
  bedtimeToleranceH: 2,
  sleepTargetH: 7.5,
  devTargetMin: 60,
  weights: { bedtime: 1, sleep: 1, dev: 2, reading: 1 },
};

export function blankEntry(day: string): Entry {
  return { day, off: false, bedtime: null, sleepH: null, devMin: null, reading: false, note: null, updatedAt: '' };
}
