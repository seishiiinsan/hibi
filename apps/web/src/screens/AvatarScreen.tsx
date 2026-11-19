import {
  BODY_COLORS,
  BODY_LABELS,
  DEFAULT_AVATAR,
  ITEMS,
  PET_ACCESSORIES,
  PETS,
  SLOTS,
  setPet,
  setSlot,
  type AvatarConfig,
  type Slot,
} from '@hibi/domain';
import { PawPrint, Palette, RotateCcw, Shirt } from 'lucide-react';
import { AvatarView } from '../components/AvatarView';
import { TopBar } from '../components/TopBar';
import { useAvatar } from '../hooks';
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

function Choice({ label, selected, onPick, swatch }: { label: string; selected: boolean; onPick: () => void; swatch?: string }) {
  return (
    <button type="button" className={`choice${selected ? ' on' : ''}`} aria-pressed={selected} onClick={onPick}>
      {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden="true" />}
      {label}
    </button>
  );
}

const BODY_SWATCH: Record<(typeof BODY_COLORS)[number], string> = {
  sage: 'var(--t-sage)',
  lilac: 'var(--t-lilac)',
  butter: 'var(--t-butter)',
  sky: 'var(--t-sky)',
  peach: 'var(--pot)',
};

export function AvatarScreen() {
  const cfg = useAvatar();
  const apply = (change: (current: AvatarConfig) => AvatarConfig) => void editAvatar(change);

  return (
    <div className="screen">
      <TopBar title="Mon avatar" />
      <section className="card avatar-stage" aria-label="Aperçu">
        <AvatarView config={cfg} width={320} />
      </section>

      <section className="card section">
        <h2 className="section-title">
          <Palette size={14} aria-hidden="true" />
          Couleur
        </h2>
        <div className="choices" role="group" aria-label="Couleur">
          {BODY_COLORS.map((c) => (
            <Choice key={c} label={BODY_LABELS[c]} swatch={BODY_SWATCH[c]} selected={cfg.body === c} onPick={() => apply((a) => ({ ...a, body: c }))} />
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
                <Choice key={i.id} label={i.label} selected={cfg[slot] === i.id} onPick={() => apply((a) => setSlot(a, slot, i.id))} />
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
            <Choice key={p.id} label={p.label} selected={cfg.pet === p.id} onPick={() => apply((a) => setPet(a, p.id))} />
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
                <Choice key={a.id} label={a.label} selected={cfg.petAccessory === a.id} onPick={() => apply((cur) => ({ ...cur, petAccessory: a.id }))} />
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
