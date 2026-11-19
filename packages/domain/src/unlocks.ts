import { BODY_COLORS, BODY_LABELS, ITEMS, PET_ACCESSORIES, PETS, type BodyColor } from './avatar.js';
import { dayScore } from './score.js';
import { addDays } from './time.js';
import type { Entry, Settings } from './types.js';

/**
 * Déblocages : tout se gagne avec l'historique, rien n'est acheté ni stocké côté serveur.
 * Clés : `body:lilac`, `item:chapeau`, `pet:lapin`, `petacc:noeud` (les ids d'objets et d'accessoires de pet
 * peuvent coïncider, d'où le préfixe).
 */
export type UnlockKey = string;

export type Requirement =
  | { kind: 'free' }
  /** n journées saisies (hors Off) */
  | { kind: 'logged'; n: number }
  /** n bonnes journées d'affilée (score ≥ 75 %) */
  | { kind: 'streak'; n: number }
  /** n journées parfaites (100 %) */
  | { kind: 'perfect'; n: number };

export const GOOD_DAY = 0.75;
const PERFECT = 0.9999;

export const REQUIREMENTS: Record<UnlockKey, Requirement> = {
  'body:sage': { kind: 'free' },
  'item:pousse': { kind: 'free' },
  'body:lilac': { kind: 'logged', n: 3 },
  'item:noeud': { kind: 'logged', n: 3 },
  'body:butter': { kind: 'logged', n: 7 },
  'item:lunettes': { kind: 'logged', n: 7 },
  'body:sky': { kind: 'logged', n: 14 },
  'item:chapeau': { kind: 'logged', n: 14 },
  'body:peach': { kind: 'logged', n: 30 },
  'item:echarpe': { kind: 'logged', n: 30 },
  'item:fleur': { kind: 'streak', n: 3 },
  'pet:lapin': { kind: 'streak', n: 3 },
  'item:livre': { kind: 'streak', n: 7 },
  'pet:escargot': { kind: 'streak', n: 7 },
  'item:bonnet': { kind: 'streak', n: 7 },
  'item:arrosoir': { kind: 'streak', n: 14 },
  'pet:oiseau': { kind: 'streak', n: 14 },
  'item:couronne': { kind: 'streak', n: 14 },
  'item:soleil': { kind: 'perfect', n: 1 },
  'petacc:noeud': { kind: 'perfect', n: 3 },
  'item:ailes': { kind: 'perfect', n: 5 },
  'item:cape': { kind: 'perfect', n: 10 },
};

/** Nom lisible d'une clé, pour « Nouveau : … ». */
export function unlockLabel(key: UnlockKey): string {
  const [kind, id = ''] = key.split(':');
  if (kind === 'body') return `Couleur ${BODY_LABELS[id as BodyColor] ?? id}`.toLowerCase().replace(/^./, (c) => c.toUpperCase());
  if (kind === 'item') return ITEMS.find((i) => i.id === id)?.label ?? id;
  if (kind === 'pet') return PETS.find((p) => p.id === id)?.label ?? id;
  return PET_ACCESSORIES.find((a) => a.id === id)?.label ?? id;
}

export const bodyKey = (id: string): UnlockKey => `body:${id}`;
export const itemKey = (id: string): UnlockKey => `item:${id}`;
export const petKey = (id: string): UnlockKey => `pet:${id}`;
export const petAccessoryKey = (id: string): UnlockKey => `petacc:${id}`;

/** Toutes les clés du catalogue (pour vérifier qu'aucune n'a été oubliée dans REQUIREMENTS). */
export function allUnlockKeys(): UnlockKey[] {
  return [
    ...BODY_COLORS.map(bodyKey),
    ...ITEMS.map((i) => itemKey(i.id)),
    ...PETS.map((p) => petKey(p.id)),
    ...PET_ACCESSORIES.map((a) => petAccessoryKey(a.id)),
  ];
}

export interface Progress {
  logged: number;
  perfect: number;
  /** Plus longue série de bonnes journées de tout l'historique. */
  bestStreak: number;
}

/**
 * Progression calculée depuis les saisies et les réglages (comme le score : jamais stockée).
 * Série : jours consécutifs avec un score ≥ 75 % ; un jour Off est ignoré, un jour non saisi la casse.
 */
export function progressFromEntries(entries: readonly Entry[], settings: Settings): Progress {
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const days = [...byDay.keys()].sort();
  const progress: Progress = { logged: 0, perfect: 0, bestStreak: 0 };
  if (!days.length) return progress;

  let run = 0;
  const last = days[days.length - 1]!;
  for (let d = days[0]!; d <= last; d = addDays(d, 1)) {
    const e = byDay.get(d);
    if (!e) {
      run = 0;
      continue;
    }
    if (e.off) continue;
    const score = dayScore(e, settings);
    if (score === null) {
      run = 0;
      continue;
    }
    progress.logged++;
    if (score >= PERFECT) progress.perfect++;
    if (score >= GOOD_DAY) {
      run++;
      progress.bestStreak = Math.max(progress.bestStreak, run);
    } else run = 0;
  }
  return progress;
}

const have = (r: Requirement, p: Progress): number =>
  r.kind === 'logged' ? p.logged : r.kind === 'streak' ? p.bestStreak : r.kind === 'perfect' ? p.perfect : 1;
const need = (r: Requirement): number => (r.kind === 'free' ? 0 : r.n);

export const isUnlockedBy = (r: Requirement, p: Progress): boolean => have(r, p) >= need(r);

/** Ce que la progression actuelle débloque. */
export function unlockedKeys(p: Progress): Set<UnlockKey> {
  const out = new Set<UnlockKey>();
  for (const [key, r] of Object.entries(REQUIREMENTS)) if (isUnlockedBy(r, p)) out.add(key);
  return out;
}

export function describeRequirement(r: Requirement): string {
  switch (r.kind) {
    case 'free':
      return 'Dès le départ';
    case 'logged':
      return r.n === 1 ? '1 journée saisie' : `${r.n} journées saisies`;
    case 'streak':
      return `${r.n} bonnes journées d’affilée`;
    case 'perfect':
      return r.n === 1 ? '1 journée parfaite' : `${r.n} journées parfaites`;
  }
}

/** « 3 / 7 » : où tu en es pour débloquer ; null si c'est déjà acquis ou gratuit. */
export function progressLabel(r: Requirement, p: Progress): string | null {
  if (r.kind === 'free' || isUnlockedBy(r, p)) return null;
  return `${Math.min(have(r, p), r.n)} / ${r.n}`;
}

/**
 * Déblocages définitifs : une fois gagné, un objet le reste, même si un changement de poids ou de
 * réglage fait baisser un score après coup. On fait donc l'union avec ce qui était déjà acquis.
 */
export function mergeUnlocked(stored: readonly UnlockKey[] | null | undefined, current: ReadonlySet<UnlockKey>): Set<UnlockKey> {
  const known = new Set(Object.keys(REQUIREMENTS));
  const out = new Set<UnlockKey>(current);
  for (const k of stored ?? []) if (known.has(k)) out.add(k);
  return out;
}
