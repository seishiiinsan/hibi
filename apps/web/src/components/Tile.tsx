import { Minus, Plus, X, type LucideIcon } from 'lucide-react';

interface TileProps {
  label: string;
  icon: LucideIcon;
  tone: 'lilac' | 'sky' | 'butter';
  value: number | null;
  /** Valeur proposée quand le champ est vide : celle de la veille, sinon l'objectif. Un tap la garde. */
  ghost: number;
  ghostHint: string;
  step: number;
  min: number;
  max: number;
  /** Pour l'heure : 23:45 + 15 min = 00:00. */
  wrap?: boolean;
  format: (v: number) => string;
  onChange: (v: number | null) => void;
  /** Saisie libre quand la tuile est remplie (sélecteur d'heure natif, clavier numérique). */
  free?: { type: 'time' | 'number'; toInput: (v: number) => string; fromInput: (s: string) => number | null; unit?: string };
}

export function Tile({ label, icon: Icon, tone, value, ghost, ghostHint, step, min, max, wrap, format, onChange, free }: TileProps) {
  const span = max - min;
  const move = (dir: 1 | -1) => {
    let v = (value ?? ghost) + dir * step;
    if (wrap) v = ((((v - min) % span) + span) % span) + min;
    else v = Math.min(max, Math.max(min, v));
    onChange(v);
  };
  const id = `t-${label}`;

  let body;
  if (value === null) {
    body = (
      <button
        type="button"
        id={id}
        className="tile-value ghost"
        aria-label={`${label} : valider ${format(ghost)} (${ghostHint})`}
        onClick={() => onChange(ghost)}
      >
        {format(ghost)}
        <small>tape pour garder</small>
      </button>
    );
  } else if (free?.type === 'time') {
    // Valeur affichée en HH:MM quel que soit le format du téléphone ; le sélecteur natif est posé dessus.
    body = (
      <span className="tile-value">
        {format(value)}
        <input
          id={id}
          type="time"
          aria-label={`${label} : ${format(value)}`}
          value={free.toInput(value)}
          onChange={(e) => {
            const v = free.fromInput(e.target.value);
            if (v !== null) onChange(v);
          }}
        />
      </span>
    );
  } else if (free) {
    // Saisie libre au clavier numérique, unité affichée à côté.
    body = (
      <label className="tile-value tile-input">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          aria-label={label}
          min={min}
          max={max}
          value={free.toInput(value)}
          style={{ width: `${Math.max(1, free.toInput(value).length) + 0.3}ch` }}
          onChange={(e) => {
            const v = free.fromInput(e.target.value);
            if (v !== null) onChange(Math.min(max, Math.max(min, v)));
          }}
        />
        <small>{free.unit}</small>
      </label>
    );
  } else {
    body = (
      <output id={id} className="tile-value">
        {format(value)}
      </output>
    );
  }

  return (
    <div className={`tile tile-${tone}`}>
      <span className="tile-head">
        <Icon size={18} aria-hidden="true" />
        {label}
        {value !== null && (
          <button type="button" className="clear" aria-label={`Effacer ${label}`} onClick={() => onChange(null)}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </span>
      {body}
      <span className="tile-keys">
        <button type="button" className="key" aria-label={`${label} moins ${step}`} onClick={() => move(-1)}>
          <Minus size={20} aria-hidden="true" />
        </button>
        <button type="button" className="key" aria-label={`${label} plus ${step}`} onClick={() => move(1)}>
          <Plus size={20} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
