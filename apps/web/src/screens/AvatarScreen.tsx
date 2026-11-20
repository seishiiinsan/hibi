import {
  BODY_COLORS,
  BODY_LABELS,
  DEFAULT_AVATAR,
  ITEMS,
  PET_ACCESSORIES,
  PETS,
  REQUIREMENTS,
  SLOTS,
  bodyKey,
  describeRequirement,
  itemKey,
  petAccessoryKey,
  petKey,
  progressLabel,
  setPet,
  setSlot,
  type AvatarConfig,
  type Slot,
  type UnlockKey,
} from '@hibi/domain';
import { Backpack, Ban, Check, Crown, Glasses, Hand, Lock, PawPrint, Palette, RotateCcw, Shirt, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AvatarView } from '../components/AvatarView';
import { TopBar } from '../components/TopBar';
import { useAvatar, useKV, useProgress, useUnlocked } from '../hooks';
import { setKV } from '../db';
import { editAvatar } from '../sync';

const SLOT_LABELS: Record<Slot, string> = {
  head: 'Tête',
  face: 'Visage',
  neck: 'Cou',
  held: 'Main',
  back: 'Dos',
};
// Ordre d'affichage : du haut vers le bas du personnage.
const SLOT_ORDER: Slot[] = ['head', 'face', 'neck', 'held', 'back'];

const BODY_SWATCH: Record<(typeof BODY_COLORS)[number], string> = {
  sage: 'var(--t-sage)',
  lilac: 'var(--t-lilac)',
  butter: 'var(--t-butter)',
  sky: 'var(--t-sky)',
  peach: 'var(--pot)',
};

type TabId = 'body' | Slot | 'pet';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'body', label: 'Couleur', icon: Palette },
  { id: 'head', label: SLOT_LABELS.head, icon: Crown },
  { id: 'face', label: SLOT_LABELS.face, icon: Glasses },
  { id: 'neck', label: SLOT_LABELS.neck, icon: Shirt },
  { id: 'held', label: SLOT_LABELS.held, icon: Hand },
  { id: 'back', label: SLOT_LABELS.back, icon: Backpack },
  { id: 'pet', label: 'Compagnon', icon: PawPrint },
];

interface CardProps {
  label: string;
  selected: boolean;
  onPick: () => void;
  icon: LucideIcon;
  swatch?: string;
  /** Clé de déblocage : si l'objet est verrouillé, la condition et l'avancement remplacent le geste. */
  unlockKey?: UnlockKey;
  isNew?: boolean;
}

function Card({ label, selected, onPick, icon: Icon, swatch, unlockKey, isNew }: CardProps) {
  const unlocked = useUnlocked();
  const progress = useProgress();
  const locked = unlockKey !== undefined && !unlocked.has(unlockKey);
  const req = unlockKey ? REQUIREMENTS[unlockKey] : undefined;
  if (locked && req) {
    const have = progressLabel(req, progress);
    const [got = 0, need = 1] = (have ?? '0 / 1').split(' / ').map(Number);
    return (
      <button type="button" className="av-card locked" disabled aria-label={`${label}, verrouillé : ${describeRequirement(req)}`}>
        <span className="av-icon">
          <Lock size={18} aria-hidden="true" />
        </span>
        <span className="av-name">{label}</span>
        <span className="av-hint">
          {describeRequirement(req)}
          {have ? ` · ${have}` : ''}
        </span>
        <span className="av-bar" aria-hidden="true">
          <i style={{ width: `${Math.round((100 * got) / Math.max(1, need))}%` }} />
        </span>
      </button>
    );
  }
  return (
    <button type="button" className={`av-card${selected ? ' on' : ''}`} aria-pressed={selected} onClick={onPick}>
      <span className="av-icon" style={swatch ? { background: swatch } : undefined}>
        {!swatch && <Icon size={18} aria-hidden="true" />}
      </span>
      <span className="av-name">{label}</span>
      {selected && (
        <span className="av-check" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      {isNew && <span className="new-tag">Nouveau</span>}
    </button>
  );
}

export function AvatarScreen() {
  const cfg = useAvatar();
  const unlocked = useUnlocked();
  const apply = (change: (current: AvatarConfig) => AvatarConfig) => void editAvatar(change);
  const [tab, setTab] = useState<TabId>('body');

  // « Nouveau » = débloqué depuis la dernière visite. On fige l'état « déjà vu » à l'ouverture, puis tout est marqué comme vu.
  // Rien n'est marqué avant la première synchro : sur un nouvel appareil, l'historique ne doit pas passer pour une nouveauté.
  const seen = useKV<UnlockKey[] | null>('unlockedSeen', null);
  const synced = useKV<string | null>('lastSyncAt', null);
  const seenAtOpen = useRef<ReadonlySet<UnlockKey> | null>(null);
  if (seenAtOpen.current === null && seen) seenAtOpen.current = new Set(seen);
  useEffect(() => {
    if (synced) void setKV('unlockedSeen', [...unlocked]);
  }, [unlocked, synced]);
  const fresh = (key: UnlockKey) => !!seenAtOpen.current && !seenAtOpen.current.has(key) && unlocked.has(key);

  const keysOf = (id: TabId): UnlockKey[] =>
    id === 'body'
      ? BODY_COLORS.map(bodyKey)
      : id === 'pet'
        ? [...PETS.map((p) => petKey(p.id)), ...PET_ACCESSORIES.map((a) => petAccessoryKey(a.id))]
        : ITEMS.filter((i) => i.slot === id).map((i) => itemKey(i.id));
  // Les objets gagnés d'abord (ordre du catalogue sinon), les verrouillés ensuite.
  const unlockedFirst = <T extends { key: UnlockKey }>(list: T[]) => [...list].sort((a, b) => Number(!unlocked.has(a.key)) - Number(!unlocked.has(b.key)));

  const none = (selected: boolean, onPick: () => void) => <Card key="none" label="Aucun" icon={Ban} selected={selected} onPick={onPick} />;

  return (
    <div className="screen avatar-screen">
      <TopBar title="Mon avatar" />

      <section className="card av-stage" aria-label="Aperçu">
        <AvatarView config={cfg} width={220} />
        <button type="button" className="icon-btn av-reset" aria-label="Remettre à zéro" onClick={() => apply(() => DEFAULT_AVATAR)}>
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </section>

      <div className="av-tabs" role="tablist" aria-label="Catégories">
        {TABS.map((t) => {
          const hasNew = keysOf(t.id).some(fresh);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`av-tab${tab === t.id ? ' on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={16} aria-hidden="true" />
              {t.label}
              {hasNew && <span className="av-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="av-list" role="tabpanel">
        {tab === 'body' && (
          <div className="av-grid" role="group" aria-label="Couleur">
            {unlockedFirst(BODY_COLORS.map((c) => ({ c, key: bodyKey(c) }))).map(({ c, key }) => (
              <Card
                key={c}
                label={BODY_LABELS[c]}
                icon={Palette}
                swatch={BODY_SWATCH[c]}
                selected={cfg.body === c}
                unlockKey={key}
                isNew={fresh(key)}
                onPick={() => apply((a) => ({ ...a, body: c }))}
              />
            ))}
          </div>
        )}

        {tab !== 'body' && tab !== 'pet' && (
          <div className="av-grid" role="group" aria-label={SLOT_LABELS[tab]}>
            {none(cfg[tab] === null, () => apply((a) => setSlot(a, tab, null)))}
            {unlockedFirst(ITEMS.filter((i) => i.slot === tab).map((i) => ({ i, key: itemKey(i.id) }))).map(({ i, key }) => (
              <Card
                key={i.id}
                label={i.label}
                icon={TABS.find((t) => t.id === tab)!.icon}
                selected={cfg[tab] === i.id}
                unlockKey={key}
                isNew={fresh(key)}
                onPick={() => apply((a) => setSlot(a, tab, i.id))}
              />
            ))}
          </div>
        )}

        {tab === 'pet' && (
          <>
            <div className="av-grid" role="group" aria-label="Compagnon">
              {none(cfg.pet === null, () => apply((a) => setPet(a, null)))}
              {unlockedFirst(PETS.map((p) => ({ p, key: petKey(p.id) }))).map(({ p, key }) => (
                <Card key={p.id} label={p.label} icon={PawPrint} selected={cfg.pet === p.id} unlockKey={key} isNew={fresh(key)} onPick={() => apply((a) => setPet(a, p.id))} />
              ))}
            </div>
            {cfg.pet && (
              <>
                <h2 className="av-sub" id="slot-petacc">
                  Accessoire
                </h2>
                <div className="av-grid" role="group" aria-labelledby="slot-petacc">
                  {none(cfg.petAccessory === null, () => apply((a) => ({ ...a, petAccessory: null })))}
                  {PET_ACCESSORIES.map((a) => (
                    <Card
                      key={a.id}
                      label={a.label}
                      icon={PawPrint}
                      selected={cfg.petAccessory === a.id}
                      unlockKey={petAccessoryKey(a.id)}
                      isNew={fresh(petAccessoryKey(a.id))}
                      onPick={() => apply((cur) => ({ ...cur, petAccessory: a.id }))}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
