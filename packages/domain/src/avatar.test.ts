import { describe, expect, it } from 'vitest';
import {
  BODY_COLORS,
  DEFAULT_AVATAR,
  ITEMS,
  MOODS,
  PETS,
  SLOTS,
  allAvatarConfigs,
  allLayerFiles,
  avatarLayers,
  bodyFile,
  moodForScore,
  normalizeAvatar,
  setPet,
  setSlot,
  validateAvatar,
  variantFile,
  type AvatarConfig,
} from './index.js';

describe('avatar : normalisation', () => {
  it('une entrée absente, nulle ou corrompue retombe sur l’avatar par défaut', () => {
    for (const bad of [undefined, null, 42, 'x', [], {}]) expect(normalizeAvatar(bad)).toEqual(DEFAULT_AVATAR);
  });

  it('une valeur inconnue est retirée, un objet rangé dans le mauvais emplacement aussi', () => {
    const cfg = normalizeAvatar({ body: 'rouge', back: 'licorne', neck: 'chapeau', head: 'echarpe', face: 'lunettes' });
    expect(cfg).toMatchObject({ body: 'sage', back: null, neck: null, head: null, face: 'lunettes' });
  });

  it('un accessoire de pet sans pet est retiré', () => {
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, pet: null, petAccessory: 'noeud' }).petAccessory).toBeNull();
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, pet: 'lapin', petAccessory: 'noeud' }).petAccessory).toBe('noeud');
  });

  it('retirer le pet retire son accessoire ; un nouveau pet garde l’accessoire', () => {
    const on = setPet(DEFAULT_AVATAR, 'lapin');
    const dressed = { ...on, petAccessory: 'noeud' as const };
    expect(setPet(dressed, null).petAccessory).toBeNull();
    expect(setPet(dressed, 'oiseau')).toMatchObject({ pet: 'oiseau', petAccessory: 'noeud' });
  });

  it('setSlot refuse un objet d’un autre emplacement', () => {
    expect(setSlot(DEFAULT_AVATAR, 'head', 'echarpe').head).toBeNull();
    expect(setSlot(DEFAULT_AVATAR, 'head', 'bonnet').head).toBe('bonnet');
  });

  it('la pousse est celle de l’avatar neuf, mais un head: null explicite reste nu', () => {
    expect(normalizeAvatar({ body: 'lilac' }).head).toBe('pousse');
    expect(normalizeAvatar({ body: 'lilac', head: null }).head).toBeNull();
  });
});

describe('avatar : validation', () => {
  it('accepte une config complète et refuse les valeurs inconnues', () => {
    expect(validateAvatar(DEFAULT_AVATAR)).toEqual([]);
    expect(validateAvatar({ ...DEFAULT_AVATAR, body: 'x' })).toEqual(['body']);
    expect(validateAvatar({ ...DEFAULT_AVATAR, head: 'echarpe' })).toEqual(['head']);
    expect(validateAvatar({ ...DEFAULT_AVATAR, petAccessory: 'noeud' })).toEqual(['petAccessory']);
    expect(validateAvatar('x')).toEqual(['avatar']);
  });
});

describe('avatar : toutes les combinaisons', () => {
  // 5 corps × 3 dos × 3 cou × 5 tête × 3 visage × 4 main × 7 (pas de pet, ou 3 pets avec/sans nœud)
  const expected = BODY_COLORS.length * 3 * 3 * 5 * 3 * 4 * (1 + PETS.length * 2);

  it('énumère le bon nombre de configurations, toutes valides et stables', () => {
    let n = 0;
    for (const cfg of allAvatarConfigs()) {
      n++;
      if (validateAvatar(cfg).length) throw new Error(`invalide : ${JSON.stringify(cfg)}`);
      if (JSON.stringify(normalizeAvatar(cfg)) !== JSON.stringify(cfg)) throw new Error(`instable : ${JSON.stringify(cfg)}`);
    }
    expect(n).toBe(expected);
  });

  it('chaque combinaison donne des calques ordonnés, sans doublon d’emplacement, tous du catalogue', () => {
    const known = new Set(allLayerFiles());
    const kinds = ['pet', 'petAccessory', 'back', 'body', 'neck', 'head', 'face', 'held'];
    for (const cfg of allAvatarConfigs()) {
      const layers = avatarLayers(cfg);
      const seen = new Set<string>();
      let prevZ = -1;
      for (const l of layers) {
        if (!known.has(l.file)) throw new Error(`calque inconnu ${l.file}`);
        if (seen.has(l.kind)) throw new Error(`deux calques « ${l.kind} » pour ${JSON.stringify(cfg)}`);
        if (l.z < prevZ) throw new Error('ordre cassé');
        seen.add(l.kind);
        prevZ = l.z;
      }
      expect(layers.filter((l) => l.kind === 'body')).toHaveLength(1);
      expect(kinds.indexOf(layers[layers.length - 1]!.kind)).toBeGreaterThanOrEqual(kinds.indexOf('body'));
      // un objet par emplacement, exactement ceux demandés
      const wanted = SLOTS.filter((s) => cfg[s]).length + 1 + (cfg.pet ? 1 : 0) + (cfg.petAccessory ? 1 : 0);
      if (layers.length !== wanted) throw new Error(`nombre de calques inattendu pour ${JSON.stringify(cfg)}`);
    }
  });

  it('le calque -alt est choisi exactement quand la couleur de l’objet se confondrait avec le corps', () => {
    for (const item of ITEMS)
      for (const body of BODY_COLORS) {
        const file = variantFile(item, body);
        expect(file.endsWith('-alt')).toBe(item.altOn?.includes(body) ?? false);
      }
  });

  it('une configuration complète produit l’empilement attendu', () => {
    const cfg: AvatarConfig = { body: 'peach', back: 'cape', neck: 'echarpe', head: 'chapeau', face: 'soleil', held: 'livre', pet: 'escargot', petAccessory: 'noeud' };
    expect(avatarLayers(cfg).map((l) => l.file)).toEqual([
      'pet-escargot', 'petacc-escargot-noeud', 'back-cape', 'body-peach',
      'neck-echarpe-alt', 'head-chapeau', 'face-soleil', 'held-livre-alt',
    ]);
  });
});

describe('avatar : humeur', () => {
  it('suit le score du jour', () => {
    expect(moodForScore(null)).toBe('neutral');
    expect(moodForScore(0.2)).toBe('sleepy');
    expect(moodForScore(0.39)).toBe('sleepy');
    expect(moodForScore(0.4)).toBe('neutral');
    expect(moodForScore(0.79)).toBe('neutral');
    expect(moodForScore(0.8)).toBe('happy');
    expect(moodForScore(1)).toBe('happy');
    expect(moodForScore(1, true)).toBe('sleepy'); // journée Off : il se repose
  });

  it('seul le corps change selon l’humeur ; le neutre garde son nom d’origine', () => {
    const cfg = { ...DEFAULT_AVATAR, body: 'lilac' as const, head: 'bonnet' };
    const files = (m: 'sleepy' | 'neutral' | 'happy') => avatarLayers(cfg, m).map((l) => l.file);
    expect(files('neutral')).toEqual(['body-lilac', 'head-bonnet-alt']);
    expect(files('happy')).toEqual(['body-lilac-happy', 'head-bonnet-alt']);
    expect(files('sleepy')).toEqual(['body-lilac-sleepy', 'head-bonnet-alt']);
  });

  it('chaque humeur de chaque corps est dans le catalogue des rendus', () => {
    const known = new Set(allLayerFiles());
    for (const b of BODY_COLORS) for (const m of MOODS) expect(known.has(bodyFile(b, m))).toBe(true);
  });
});
