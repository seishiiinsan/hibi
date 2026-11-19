import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS as S,
  addDays,
  bedtimeScore,
  blankEntry,
  dayScore,
  defaultDay,
  entriesToCsv,
  indexEntries,
  scoreColor,
  sevenDayScore,
  streak,
  validateEntry,
  validateSettings,
  type Entry,
} from './index.js';

const TS = '2026-12-01T20:00:00.000Z';
const entry = (day: string, patch: Partial<Entry> = {}): Entry => ({ ...blankEntry(day), updatedAt: TS, ...patch });

// Cas de test de référence du cahier des charges (§4) : objectifs coucher 00:00, tolérance 2 h, 7,5 h, 60 min ; poids 1/1/2/1.
describe('cas de référence du cahier des charges', () => {
  it('1. 23:00, 8 h, 54 min, lu → 96 %', () => {
    const e = entry('2026-12-01', { bedtime: '23:00', sleepH: 8, devMin: 54, reading: true });
    expect(dayScore(e, S)).toBeCloseTo(0.96, 10);
  });

  it('2. coucher 00:30 / 01:00 / 03:00 → 75 % / 50 % / 0 %', () => {
    expect(bedtimeScore('00:30', S)).toBeCloseTo(0.75, 10);
    expect(bedtimeScore('01:00', S)).toBeCloseTo(0.5, 10);
    expect(bedtimeScore('03:00', S)).toBe(0);
  });

  it('3. Off coché, autres champs remplis → score vide', () => {
    const e = entry('2026-12-01', { off: true, bedtime: '23:00', sleepH: 8, devMin: 60, reading: true });
    expect(dayScore(e, S)).toBeNull();
  });

  it('4. lu du 1er au 5 déc., Off le 2 → série lecture = 4 le 5 déc.', () => {
    const idx = indexEntries([
      entry('2026-12-01', { reading: true }),
      entry('2026-12-02', { off: true }),
      entry('2026-12-03', { reading: true }),
      entry('2026-12-04', { reading: true }),
      entry('2026-12-05', { reading: true }),
    ]);
    expect(streak(idx, 'reading', '2026-12-05', S)).toBe(4);
  });

  it('5. dev 54 min, non lu, coucher et sommeil vides → 60 %', () => {
    expect(dayScore(entry('2026-12-01', { devMin: 54 }), S)).toBeCloseTo(0.6, 10);
  });

  it('6. lu le 1er et le 3 déc., rien saisi le 2 → série lecture = 1 le 3 déc.', () => {
    const idx = indexEntries([entry('2026-12-01', { reading: true }), entry('2026-12-03', { reading: true })]);
    expect(streak(idx, 'reading', '2026-12-03', S)).toBe(1);
  });
});

describe('score du jour', () => {
  it('est vide si ni coucher, ni sommeil, ni dev, même si lu', () => {
    expect(dayScore(entry('2026-12-01', { reading: true }), S)).toBeNull();
    expect(dayScore(undefined, S)).toBeNull();
  });

  it('gère le coucher en avance de plus de 12 h comme un retard (mod 24 h)', () => {
    expect(bedtimeScore('21:00', S)).toBe(1);
    expect(bedtimeScore('12:30', S)).toBe(1); // -11,5 h
    expect(bedtimeScore('11:30', S)).toBe(0); // +11,5 h
  });

  it('plafonne sommeil et dev à 1', () => {
    expect(dayScore(entry('2026-12-01', { sleepH: 10, devMin: 120, reading: true }), S)).toBe(1);
  });

  it('suit les poids des réglages', () => {
    const s = { ...S, weights: { bedtime: 0, sleep: 0, dev: 1, reading: 0 } };
    expect(dayScore(entry('2026-12-01', { devMin: 30, sleepH: 8 }), s)).toBeCloseTo(0.5, 10);
  });
});

describe('séries', () => {
  it("compte jusqu'à la veille, sans casser si le jour de référence n'est pas encore atteint", () => {
    const idx = indexEntries([
      entry('2026-12-01', { devMin: 60 }),
      entry('2026-12-02', { devMin: 75 }),
      entry('2026-12-03', { devMin: 10 }),
    ]);
    expect(streak(idx, 'dev', '2026-12-03', S)).toBe(2);
    expect(streak(idx, 'dev', '2026-12-04', S)).toBe(0);
  });

  it('un critère non saisi dans une journée saisie casse la série', () => {
    const idx = indexEntries([entry('2026-12-01', { sleepH: 8 }), entry('2026-12-02', { devMin: 60 }), entry('2026-12-03', { sleepH: 8 })]);
    expect(streak(idx, 'sleep', '2026-12-03', S)).toBe(1);
  });
});

describe('score 7 jours', () => {
  it('moyenne les scores non vides des 7 derniers jours', () => {
    const idx = indexEntries([
      entry('2026-11-26', { devMin: 60, sleepH: 7.5, bedtime: '23:00', reading: true }), // hors fenêtre
      entry('2026-11-27', { devMin: 60, reading: true }), // 100 %
      entry('2026-12-01', { devMin: 54 }), // 60 %
      entry('2026-12-02', { off: true, devMin: 60 }), // ignoré
      entry('2026-12-03', { reading: true }), // vide
    ]);
    expect(sevenDayScore(idx, '2026-12-03', S)).toBeCloseTo(0.8, 10);
    expect(sevenDayScore(new Map(), '2026-12-03', S)).toBeNull();
  });
});

describe('dates', () => {
  it('ouvre la veille avant midi, le jour même après (heure de Paris)', () => {
    expect(defaultDay(new Date('2026-12-05T10:59:00Z'))).toBe('2026-12-04'); // 11:59 à Paris
    expect(defaultDay(new Date('2026-12-05T11:00:00Z'))).toBe('2026-12-05'); // 12:00 à Paris
    expect(defaultDay(new Date('2026-12-04T23:30:00Z'))).toBe('2026-12-04'); // 00:30 le 5 à Paris
    expect(defaultDay(new Date('2026-07-05T09:59:00Z'))).toBe('2026-07-04'); // 11:59 heure d'été
  });

  it('additionne les jours à travers les changements de mois et d’heure', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('validation', () => {
  it('refuse un updatedAt sans suffixe Z ou au mauvais format', () => {
    expect(validateEntry(entry('2026-12-01'))).toEqual([]);
    expect(validateEntry(entry('2026-12-01', { updatedAt: '2026-12-01T20:00:00+01:00' }))).toContain('updatedAt');
    expect(validateEntry(entry('2026-02-30'))).toContain('day');
    expect(validateEntry(entry('2026-12-01', { bedtime: '24:00', devMin: 1.5 }))).toEqual(['bedtime', 'devMin']);
  });

  it('refuse des poids tous nuls', () => {
    expect(validateSettings(S)).toEqual([]);
    expect(validateSettings({ ...S, weights: { bedtime: 0, sleep: 0, dev: 0, reading: 0 } })).toEqual(['weights']);
  });
});

describe('affichage et export', () => {
  it('dégradé rouge → jaune → vert', () => {
    expect(scoreColor(0)).toBe('#e67c73');
    expect(scoreColor(0.5)).toBe('#ffd666');
    expect(scoreColor(1)).toBe('#57bb8a');
  });

  it('exporte en CSV avec échappement et neutralisation des formules', () => {
    const csv = entriesToCsv([entry('2026-12-01', { devMin: 54, note: '=HYPERLINK("x"), ok' })], S);
    expect(csv.split('\r\n')[1]).toBe(`2026-12-01,0,,,54,0,60,"'=HYPERLINK(""x""), ok",${TS}`);
  });
});
