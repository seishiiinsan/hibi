import {
  BODY_COLORS,
  BODY_LABELS,
  DEFAULT_AVATAR,
  ITEMS,
  PET_ACCESSORIES,
  PETS,
  REQUIREMENTS,
  bodyKey,
  describeRequirement,
  itemKey,
  petAccessoryKey,
  petKey,
  progressLabel,
  setPet,
  setSlot,
  type AvatarConfig,
  type Progress,
  type Slot,
  type UnlockKey,
} from '@hibi/domain';
import { Backpack, Check, ChevronLeft, Crown, Glasses, Hand, Lock, PawPrint, Palette, RotateCcw, Shirt, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AvatarView } from '../components/AvatarView';
import { setKV } from '../db';
import { useAvatar, useKV, useProgress, useUnlocked } from '../hooks';
import { editAvatar } from '../sync';

type TabId = 'body' | Slot | 'pet';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'body', label: 'Couleur', icon: Palette },
  { id: 'head', label: 'Tête', icon: Crown },
  { id: 'face', label: 'Visage', icon: Glasses },
  { id: 'neck', label: 'Cou', icon: Shirt },
  { id: 'held', label: 'Main', icon: Hand },
  { id: 'back', label: 'Dos', icon: Backpack },
  { id: 'pet', label: 'Compagnon', icon: PawPrint },
];

/** Fond de la scène : la teinte du corps, pour que chaque couleur ait son ambiance. */
const STAGE_TONE: Record<(typeof BODY_COLORS)[number], string> = {
  sage: 'var(--t-sage)',
  lilac: 'var(--t-lilac)',
  butter: 'var(--t-butter)',
  sky: 'var(--t-sky)',
  peach: 'var(--pot)',
};

/** Une option du vestiaire : l'avatar tel qu'il serait en la portant, et sa clé de déblocage. */
interface Option {
  id: string;
  label: string;
  key?: UnlockKey;
  result: AvatarConfig;
  selected: boolean;
}

interface Section {
  group: string;
  /** Titre affiché au-dessus de la grille (le premier groupe d'un onglet n'en a pas : l'onglet suffit). */
  title?: string;
  options: Option[];
}

function tabSections(tab: TabId, cfg: AvatarConfig): Section[] {
  if (tab === 'body') {
    return [
      {
        group: 'Couleur',
        options: BODY_COLORS.map((c) => ({ id: c, label: BODY_LABELS[c], key: bodyKey(c), result: { ...cfg, body: c }, selected: cfg.body === c })),
      },
    ];
  }
  if (tab === 'pet') {
    const sections: Section[] = [
      {
        group: 'Compagnon',
        options: [
          { id: 'none', label: 'Aucun', result: setPet(cfg, null), selected: cfg.pet === null },
          ...PETS.map((p) => ({ id: p.id, label: p.label, key: petKey(p.id), result: setPet(cfg, p.id), selected: cfg.pet === p.id })),
        ],
      },
    ];
    if (cfg.pet) {
      sections.push({
        group: 'Accessoire',
        title: 'Accessoire',
        options: [
          { id: 'none', label: 'Aucun', result: { ...cfg, petAccessory: null }, selected: cfg.petAccessory === null },
          ...PET_ACCESSORIES.map((a) => ({
            id: a.id,
            label: a.label,
            key: petAccessoryKey(a.id),
            result: { ...cfg, petAccessory: a.id },
            selected: cfg.petAccessory === a.id,
          })),
        ],
      });
    }
    return sections;
  }
  return [
    {
      group: TABS.find((t) => t.id === tab)!.label,
      options: [
        { id: 'none', label: 'Aucun', result: setSlot(cfg, tab, null), selected: cfg[tab] === null },
        ...ITEMS.filter((i) => i.slot === tab).map((i) => ({
          id: i.id,
          label: i.label,
          key: itemKey(i.id),
          result: setSlot(cfg, tab, i.id),
          selected: cfg[tab] === i.id,
        })),
      ],
    },
  ];
}

function lockInfo(key: UnlockKey, progress: Progress) {
  const req = REQUIREMENTS[key]!;
  const have = progressLabel(req, progress);
  const [got = 0, need = 1] = (have ?? '0 / 1').split(' / ').map(Number);
  return { text: describeRequirement(req), have, ratio: got / Math.max(1, need) };
}

export function AvatarScreen() {
  const cfg = useAvatar();
  const unlocked = useUnlocked();
  const progress = useProgress();
  const [tab, setTab] = useState<TabId>('body');
  /** Essai d'un objet verrouillé : affiché sur la scène, jamais enregistré. */
  const [trying, setTrying] = useState<{ option: Option; lock: ReturnType<typeof lockInfo> } | null>(null);
  const apply = (change: (current: AvatarConfig) => AvatarConfig) => {
    setTrying(null);
    void editAvatar(change);
  };

  // « Nouveau » = débloqué depuis la dernière visite. On fige l'état « déjà vu » à l'ouverture, puis tout est marqué comme vu.
  // Rien n'est marqué avant la première synchro : sur un nouvel appareil, l'historique ne doit pas passer pour une nouveauté.
  const seen = useKV<UnlockKey[] | null>('unlockedSeen', null);
  const synced = useKV<string | null>('lastSyncAt', null);
  const seenAtOpen = useRef<ReadonlySet<UnlockKey> | null>(null);
  if (seenAtOpen.current === null && seen) seenAtOpen.current = new Set(seen);
  useEffect(() => {
    if (synced) void setKV('unlockedSeen', [...unlocked]);
  }, [unlocked, synced]);
  const fresh = (key?: UnlockKey) => !!key && !!seenAtOpen.current && !seenAtOpen.current.has(key) && unlocked.has(key);

  const allKeys = Object.keys(REQUIREMENTS);
  const owned = allKeys.filter((k) => unlocked.has(k)).length;
  const shown = trying?.option.result ?? cfg;

  return (
    <div className="screen wardrobe" style={{ ['--stage' as string]: STAGE_TONE[shown.body] }}>
      <section className="wardrobe-stage" aria-label="Aperçu">
        <nav className="wardrobe-bar">
          <a href="#/" className="stage-btn" aria-label="Retour à la saisie depuis Mon avatar">
            <ChevronLeft size={22} aria-hidden="true" />
          </a>
          <span className="wardrobe-count">
            <b className="num">{owned}</b> / {allKeys.length} objets gagnés
          </span>
          <button type="button" className="stage-btn" aria-label="Remettre à zéro" onClick={() => apply(() => DEFAULT_AVATAR)}>
            <RotateCcw size={18} aria-hidden="true" />
          </button>
        </nav>
        <div className="wardrobe-hero">
          <div className="wardrobe-figure">
            <span className="wardrobe-floor" aria-hidden="true" />
            <AvatarView config={shown} width={340} />
          </div>
        </div>
        {trying && (
          <div className="try-banner" role="status">
            <Lock size={16} aria-hidden="true" />
            <span>
              <b>Essai : {trying.option.label}</b>
              {trying.lock.text}
              {trying.lock.have ? ` · ${trying.lock.have}` : ''}
            </span>
            <button type="button" aria-label="Arrêter l'essai" onClick={() => setTrying(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      <section className="drawer" aria-label="Vestiaire">
        <div className="drawer-tabs" role="tablist" aria-label="Catégories">
          {TABS.map((t) => {
            const hasNew = tabSections(t.id, cfg).some((s) => s.options.some((o) => fresh(o.key)));
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`drawer-tab${tab === t.id ? ' on' : ''}`}
                onClick={() => {
                  setTab(t.id);
                  setTrying(null);
                }}
              >
                <span className="drawer-tab-icon">
                  <t.icon size={20} aria-hidden="true" />
                  {hasNew && <span className="av-dot" aria-hidden="true" />}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="drawer-list" role="tabpanel">
          {tabSections(tab, cfg).map((s) => (
            <div key={s.group}>
              {s.title && (
                <h2 className="drawer-sub" id={`sub-${s.group}`}>
                  {s.title}
                </h2>
              )}
              <div
                className="drawer-grid"
                role="group"
                aria-label={s.title ? undefined : s.group}
                aria-labelledby={s.title ? `sub-${s.group}` : undefined}
              >
                {s.options.map((o) => {
                  const lock = o.key && !unlocked.has(o.key) ? lockInfo(o.key, progress) : null;
                  const isTrying = !!o.key && trying?.option.key === o.key;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={`slot${o.selected ? ' on' : ''}${lock ? ' locked' : ''}${isTrying ? ' trying' : ''}`}
                      aria-label={lock ? `${o.label}, verrouillé : ${lock.text}` : o.label}
                      aria-pressed={lock ? undefined : o.selected}
                      aria-disabled={lock ? true : undefined}
                      onClick={() => (lock ? setTrying(isTrying ? null : { option: o, lock }) : apply(() => o.result))}
                    >
                      <span
                        className={`slot-thumb${tab === 'pet' ? ' wide' : ''}`}
                        style={tab === 'body' ? { ['--stage' as string]: STAGE_TONE[o.result.body] } : undefined}
                      >
                        {/* Vignette = l'avatar qui porte l'objet ; hors onglet Compagnon on retire le pet pour zoomer sur le corps. */}
                        <AvatarView config={tab === 'pet' ? o.result : setPet(o.result, null)} width={tab === 'pet' ? 112 : 168} label={false} />
                      </span>
                      <span className="slot-name">{o.label}</span>
                      {o.selected && (
                        <span className="slot-badge on" aria-hidden="true">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                      {lock && (
                        <>
                          <span className="slot-badge" aria-hidden="true">
                            <Lock size={12} strokeWidth={2.5} />
                          </span>
                          <span className="slot-bar" aria-hidden="true">
                            <i style={{ width: `${Math.round(lock.ratio * 100)}%` }} />
                          </span>
                        </>
                      )}
                      {fresh(o.key) && <span className="new-tag">Nouveau</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
