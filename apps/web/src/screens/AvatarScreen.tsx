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
import { Lock, PawPrint, Palette, RotateCcw, Shirt } from 'lucide-react';
import { useEffect, useRef } from 'react';
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

interface ChoiceProps {
  label: string;
  selected: boolean;
  onPick: () => void;
  swatch?: string;
  /** Clé de déblocage : si l'objet est verrouillé, la condition et l'avancement remplacent le geste. */
  unlockKey?: UnlockKey;
  isNew?: boolean;
}

function Choice({ label, selected, onPick, swatch, unlockKey, isNew }: ChoiceProps) {
  const unlocked = useUnlocked();
  const progress = useProgress();
  const locked = unlockKey !== undefined && !unlocked.has(unlockKey);
  const req = unlockKey ? REQUIREMENTS[unlockKey] : undefined;
  if (locked && req) {
    const have = progressLabel(req, progress);
    return (
      <button type="button" className="choice locked" disabled aria-label={`${label}, verrouillé : ${describeRequirement(req)}`}>
        <Lock size={14} aria-hidden="true" />
        <span className="choice-text">
          {label}
          <small>
            {describeRequirement(req)}
            {have ? ` · ${have}` : ''}
          </small>
        </span>
      </button>
    );
  }
  return (
    <button type="button" className={`choice${selected ? ' on' : ''}`} aria-pressed={selected} onClick={onPick}>
      {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden="true" />}
      {label}
      {isNew && <span className="new-tag">Nouveau</span>}
    </button>
  );
}

export function AvatarScreen() {
  const cfg = useAvatar();
  const unlocked = useUnlocked();
  const apply = (change: (current: AvatarConfig) => AvatarConfig) => void editAvatar(change);

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

  return (
    <div className="screen">
      <TopBar title="Mon avatar" />
      {/* Reste visible pendant qu'on fait défiler les cosmétiques. */}
      <section className="card avatar-stage" aria-label="Aperçu">
        <AvatarView config={cfg} width={240} />
      </section>

      <section className="card section">
        <h2 className="section-title">
          <Palette size={14} aria-hidden="true" />
          Couleur
        </h2>
        <div className="choices" role="group" aria-label="Couleur">
          {BODY_COLORS.map((c) => (
            <Choice
              key={c}
              label={BODY_LABELS[c]}
              swatch={BODY_SWATCH[c]}
              selected={cfg.body === c}
              unlockKey={bodyKey(c)}
              isNew={fresh(bodyKey(c))}
              onPick={() => apply((a) => ({ ...a, body: c }))}
            />
          ))}
        </div>
      </section>

      <section className="card section">
        <h2 className="section-title">
          <Shirt size={14} aria-hidden="true" />
          Cosmétiques
        </h2>
        {SLOT_ORDER.filter((s) => SLOTS.includes(s)).map((slot) => (
          <div key={slot} className="choice-row">
            <span className="choice-label" id={`slot-${slot}`}>
              {SLOT_LABELS[slot]}
            </span>
            <div className="choices" role="group" aria-labelledby={`slot-${slot}`}>
              <Choice label="Aucun" selected={cfg[slot] === null} onPick={() => apply((a) => setSlot(a, slot, null))} />
              {ITEMS.filter((i) => i.slot === slot).map((i) => (
                <Choice
                  key={i.id}
                  label={i.label}
                  selected={cfg[slot] === i.id}
                  unlockKey={itemKey(i.id)}
                  isNew={fresh(itemKey(i.id))}
                  onPick={() => apply((a) => setSlot(a, slot, i.id))}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card section">
        <h2 className="section-title">
          <PawPrint size={14} aria-hidden="true" />
          Compagnon
        </h2>
        <div className="choices" role="group" aria-label="Compagnon">
          <Choice label="Aucun" selected={cfg.pet === null} onPick={() => apply((a) => setPet(a, null))} />
          {PETS.map((p) => (
            <Choice
              key={p.id}
              label={p.label}
              selected={cfg.pet === p.id}
              unlockKey={petKey(p.id)}
              isNew={fresh(petKey(p.id))}
              onPick={() => apply((a) => setPet(a, p.id))}
            />
          ))}
        </div>
        {cfg.pet && (
          <div className="choice-row">
            <span className="choice-label" id="slot-petacc">
              Accessoire
            </span>
            <div className="choices" role="group" aria-labelledby="slot-petacc">
              <Choice label="Aucun" selected={cfg.petAccessory === null} onPick={() => apply((a) => ({ ...a, petAccessory: null }))} />
              {PET_ACCESSORIES.map((a) => (
                <Choice
                  key={a.id}
                  label={a.label}
                  selected={cfg.petAccessory === a.id}
                  unlockKey={petAccessoryKey(a.id)}
                  isNew={fresh(petAccessoryKey(a.id))}
                  onPick={() => apply((cur) => ({ ...cur, petAccessory: a.id }))}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={() => apply(() => DEFAULT_AVATAR)}>
          <RotateCcw size={18} aria-hidden="true" />
          Remettre à zéro
        </button>
      </div>
    </div>
  );
}
