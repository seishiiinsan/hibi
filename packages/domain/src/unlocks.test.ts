import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS as S,
  REQUIREMENTS,
  allAvatarConfigs,
  allUnlockKeys,
  blankEntry,
  describeRequirement,
  mergeUnlocked,
  progressFromEntries,
  progressLabel,
  unlockedKeys,
  type Entry,
} from './index.js';

const TS = '2026-12-01T20:00:00.000Z';
const full = (day: string, patch: Partial<Entry> = {}): Entry => ({
  ...blankEntry(day), updatedAt: TS, bedtime: '23:00', sleepH: 8, devMin: 60, reading: true, ...patch,
});
const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const run = (n: number, patch: Partial<Entry> = {}) => Array.from({ length: n }, (_, i) => full(day(i), patch));

describe('déblocages : catalogue', () => {
  it('chaque objet, couleur, pet et accessoire a une condition, et rien d’autre', () => {
    expect(Object.keys(REQUIREMENTS).sort()).toEqual(allUnlockKeys().sort());
  });

  it('l’avatar de départ est jouable sans rien avoir gagné', () => {
    const start = unlockedKeys(progressFromEntries([], S));
    expect(start.has('body:sage') && start.has('item:pousse')).toBe(true);
    expect(DEFAULT_AVATAR.body).toBe('sage');
    expect(DEFAULT_AVATAR.head).toBe('pousse');
  });

  it('chaque objet est atteignable : une longue série parfaite débloque tout', () => {
    const all = unlockedKeys(progressFromEntries(run(40), S));
    expect(all.size).toBe(allUnlockKeys().length);
  });
});

describe('déblocages : progression', () => {
  it('compte les journées saisies, parfaites et la meilleure série', () => {
    const p = progressFromEntries(run(10), S);
    expect(p).toEqual({ logged: 10, perfect: 10, bestStreak: 10 });
  });

  it('un jour non saisi casse la série, un jour Off l’ignore', () => {
    const withGap = [...run(3), ...run(9).slice(4)]; // jours 0-2 puis 4-8 : le 3 manque
    expect(progressFromEntries(withGap, S).bestStreak).toBe(5);
    const withOff = [full(day(0)), full(day(1), { off: true }), full(day(2))];
    expect(progressFromEntries(withOff, S)).toEqual({ logged: 2, perfect: 2, bestStreak: 2 });
  });

  it('une mauvaise journée coupe la série mais reste comptée comme saisie', () => {
    const bad = full(day(2), { bedtime: '03:00', sleepH: 2, devMin: 0, reading: false });
    const p = progressFromEntries([full(day(0)), full(day(1)), bad, full(day(3))], S);
    expect(p).toEqual({ logged: 4, perfect: 3, bestStreak: 2 });
  });

  it('un jour sans coucher, sommeil ni dev n’est pas une journée saisie', () => {
    expect(progressFromEntries([blankEntry(day(0))], S).logged).toBe(0);
  });

  it('les conditions s’ouvrent au bon seuil', () => {
    const at = (n: number) => unlockedKeys(progressFromEntries(run(n), S));
    expect(at(2).has('body:lilac')).toBe(false);
    expect(at(3).has('body:lilac')).toBe(true);
    expect(at(2).has('item:soleil')).toBe(true); // 1 journée parfaite
    expect(at(9).has('item:cape')).toBe(false);
    expect(at(10).has('item:cape')).toBe(true);
  });

  it('affiche la condition et l’avancement', () => {
    const p = progressFromEntries(run(2), S);
    expect(describeRequirement({ kind: 'streak', n: 7 })).toBe('7 bonnes journées d’affilée');
    expect(progressLabel({ kind: 'logged', n: 7 }, p)).toBe('2 / 7');
    expect(progressLabel({ kind: 'logged', n: 1 }, p)).toBeNull();
    expect(progressLabel({ kind: 'free' }, p)).toBeNull();
  });
});

describe('déblocages : définitifs', () => {
  it('un objet gagné le reste, même si le score baisse ensuite', () => {
    const gained = unlockedKeys(progressFromEntries(run(10), S));
    // l'historique est modifié : plus rien n'est atteint
    const now = unlockedKeys(progressFromEntries([], S));
    expect(now.has('item:cape')).toBe(false);
    expect(mergeUnlocked([...gained], now).has('item:cape')).toBe(true);
  });

  it('ignore les clés inconnues d’un ancien stockage', () => {
    const merged = mergeUnlocked(['item:licorne', 'item:cape'], new Set());
    expect(merged.has('item:licorne')).toBe(false);
    expect(merged.has('item:cape')).toBe(true);
  });

  it('énumérer toutes les combinaisons reste possible avec le catalogue de déblocages', () => {
    let n = 0;
    for (const _ of allAvatarConfigs()) n++;
    expect(n).toBeGreaterThan(0);
  });
});
