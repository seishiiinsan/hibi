/**
 * Personnalisation de l'avatar « Pousse » : catalogue, règles de compatibilité et calques à empiler.
 *
 * Les calques sont rendus par assets/3d/build_hibi_3d.py (même caméra, fond transparent, corps en
 * holdout). Garantie de cohérence : un seul objet par emplacement, un ordre d'empilement fixe, et une
 * couleur alternative automatique quand l'objet se confondrait avec la couleur du corps.
 */

export const BODY_COLORS = ['sage', 'lilac', 'butter', 'sky', 'peach'] as const;
export type BodyColor = (typeof BODY_COLORS)[number];

/** Du fond vers l'avant. `body` est le corps lui-même, posé entre `back` et `neck`. */
export const SLOTS = ['back', 'neck', 'head', 'face', 'held'] as const;
export type Slot = (typeof SLOTS)[number];

export interface AvatarItem {
  id: string;
  slot: Slot;
  label: string;
  /** Corps sur lesquels la couleur par défaut se confond : on bascule alors sur le calque « -alt ». */
  altOn?: readonly BodyColor[];
}

export const ITEMS: readonly AvatarItem[] = [
  { id: 'ailes', slot: 'back', label: 'Ailes de feuille', altOn: ['sage'] },
  { id: 'cape', slot: 'back', label: 'Cape' },
  { id: 'echarpe', slot: 'neck', label: 'Écharpe', altOn: ['peach'] },
  { id: 'noeud', slot: 'neck', label: 'Nœud papillon', altOn: ['lilac'] },
  { id: 'pousse', slot: 'head', label: 'Pousse' },
  { id: 'chapeau', slot: 'head', label: 'Chapeau de paille', altOn: ['butter'] },
  { id: 'bonnet', slot: 'head', label: 'Bonnet', altOn: ['lilac'] },
  { id: 'couronne', slot: 'head', label: 'Couronne de fleurs' },
  { id: 'lunettes', slot: 'face', label: 'Lunettes rondes' },
  { id: 'soleil', slot: 'face', label: 'Lunettes de soleil' },
  { id: 'arrosoir', slot: 'held', label: 'Arrosoir', altOn: ['sky'] },
  { id: 'livre', slot: 'held', label: 'Livre', altOn: ['peach'] },
  { id: 'fleur', slot: 'held', label: 'Fleur', altOn: ['peach'] },
];

export const PETS = [
  { id: 'lapin', label: 'Lapin' },
  { id: 'escargot', label: 'Escargot' },
  { id: 'oiseau', label: 'Oiseau' },
] as const;
export type PetId = (typeof PETS)[number]['id'];

export const PET_ACCESSORIES = [{ id: 'noeud', label: 'Petit nœud' }] as const;
export type PetAccessoryId = (typeof PET_ACCESSORIES)[number]['id'];

export const BODY_LABELS: Record<BodyColor, string> = {
  sage: 'Sauge',
  lilac: 'Lilas',
  butter: 'Beurre',
  sky: 'Ciel',
  peach: 'Pêche',
};

export interface AvatarConfig {
  body: BodyColor;
  back: string | null;
  neck: string | null;
  head: string | null;
  face: string | null;
  held: string | null;
  pet: PetId | null;
  /** Ne s'affiche que si un pet est choisi. */
  petAccessory: PetAccessoryId | null;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  body: 'sage',
  back: null,
  neck: null,
  head: 'pousse',
  face: null,
  held: null,
  pet: null,
  petAccessory: null,
};

const itemsOf = (slot: Slot) => ITEMS.filter((i) => i.slot === slot);
const isOneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * Rend n'importe quelle entrée (JSON ancien, corrompu, venu du réseau) cohérente et affichable :
 * valeur inconnue → défaut, objet rangé dans le mauvais emplacement → retiré, accessoire de pet sans pet → retiré.
 * Idempotente : normalizeAvatar(normalizeAvatar(x)) = normalizeAvatar(x).
 */
export function normalizeAvatar(input: unknown): AvatarConfig {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const slotValue = (slot: Slot): string | null => {
    const v = raw[slot];
    return typeof v === 'string' && itemsOf(slot).some((i) => i.id === v) ? v : slot === 'head' && !('head' in raw) ? 'pousse' : null;
  };
  const pet = isOneOf(raw.pet, PETS.map((p) => p.id)) ? raw.pet : null;
  const accIds = PET_ACCESSORIES.map((a) => a.id);
  return {
    body: isOneOf(raw.body, BODY_COLORS) ? raw.body : DEFAULT_AVATAR.body,
    back: slotValue('back'),
    neck: slotValue('neck'),
    head: slotValue('head'),
    face: slotValue('face'),
    held: slotValue('held'),
    pet,
    petAccessory: pet && isOneOf(raw.petAccessory, accIds) ? raw.petAccessory : null,
  };
}

/** Liste des champs invalides d'une entrée brute (pour refuser une écriture côté API). */
export function validateAvatar(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return ['avatar'];
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  if (!isOneOf(raw.body, BODY_COLORS)) errors.push('body');
  for (const slot of SLOTS) {
    const v = raw[slot];
    if (v !== null && !(typeof v === 'string' && itemsOf(slot).some((i) => i.id === v))) errors.push(slot);
  }
  if (raw.pet !== null && !isOneOf(raw.pet, PETS.map((p) => p.id))) errors.push('pet');
  if (raw.petAccessory !== null && !isOneOf(raw.petAccessory, PET_ACCESSORIES.map((a) => a.id))) errors.push('petAccessory');
  else if (raw.petAccessory !== null && raw.pet === null) errors.push('petAccessory');
  return errors;
}

/** Choisit une valeur pour un emplacement en gardant la configuration cohérente (un seul objet par emplacement). */
export function setSlot(cfg: AvatarConfig, slot: Slot, id: string | null): AvatarConfig {
  return normalizeAvatar({ ...cfg, [slot]: id });
}

export function setPet(cfg: AvatarConfig, pet: PetId | null): AvatarConfig {
  return normalizeAvatar({ ...cfg, pet, petAccessory: pet ? cfg.petAccessory : null });
}

export interface AvatarLayer {
  /** Nom de fichier sans extension, sous /avatar/. */
  file: string;
  /** Ordre d'empilement (croissant = devant). */
  z: number;
  kind: 'back' | 'pet' | 'petAccessory' | 'body' | 'neck' | 'head' | 'face' | 'held';
}

const Z: Record<AvatarLayer['kind'], number> = { pet: 0, petAccessory: 1, back: 2, body: 3, neck: 4, head: 5, face: 6, held: 7 };

/** Variante de couleur d'un objet sur un corps donné (« -alt » quand la couleur par défaut se confondrait). */
export function variantFile(item: AvatarItem, body: BodyColor): string {
  return `${item.slot}-${item.id}${item.altOn?.includes(body) ? '-alt' : ''}`;
}

/** Calques à empiler, du fond vers l'avant, pour une configuration (normalisée en entrée). */
export function avatarLayers(input: unknown): AvatarLayer[] {
  const cfg = normalizeAvatar(input);
  const layers: AvatarLayer[] = [];
  if (cfg.pet) {
    layers.push({ file: `pet-${cfg.pet}`, z: Z.pet, kind: 'pet' });
    if (cfg.petAccessory) layers.push({ file: `petacc-${cfg.pet}-${cfg.petAccessory}`, z: Z.petAccessory, kind: 'petAccessory' });
  }
  layers.push({ file: `body-${cfg.body}`, z: Z.body, kind: 'body' });
  for (const slot of SLOTS) {
    const id = cfg[slot];
    const item = id ? ITEMS.find((i) => i.id === id && i.slot === slot) : undefined;
    if (item) layers.push({ file: variantFile(item, cfg.body), z: Z[slot], kind: slot });
  }
  return layers.sort((a, b) => a.z - b.z);
}

/** Tous les fichiers de calques que le catalogue peut demander (pour vérifier que les rendus existent). */
export function allLayerFiles(): string[] {
  const files = new Set<string>();
  for (const body of BODY_COLORS) {
    files.add(`body-${body}`);
    for (const item of ITEMS) files.add(variantFile(item, body));
  }
  for (const p of PETS) {
    files.add(`pet-${p.id}`);
    for (const a of PET_ACCESSORIES) files.add(`petacc-${p.id}-${a.id}`);
  }
  return [...files].sort();
}

/** Énumère toutes les configurations possibles (utilisé par les tests de combinaisons). */
export function* allAvatarConfigs(): Generator<AvatarConfig> {
  const opt = (slot: Slot) => [null, ...itemsOf(slot).map((i) => i.id)];
  const pets: [PetId | null, PetAccessoryId | null][] = [[null, null]];
  for (const p of PETS) {
    pets.push([p.id, null]);
    for (const a of PET_ACCESSORIES) pets.push([p.id, a.id]);
  }
  for (const body of BODY_COLORS)
    for (const back of opt('back'))
      for (const neck of opt('neck'))
        for (const head of opt('head'))
          for (const face of opt('face'))
            for (const held of opt('held'))
              for (const [pet, petAccessory] of pets) yield { body, back, neck, head, face, held, pet, petAccessory };
}
