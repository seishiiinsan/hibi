interface StepperProps {
  label: string;
  value: number | null;
  /** Valeur proposée quand le champ est vide : celle de la veille, sinon l'objectif. Un tap la valide. */
  ghost: number;
  ghostHint: string;
  step: number;
  min: number;
  max: number;
  /** Pour l'heure : 23:45 + 15 min = 00:00. */
  wrap?: boolean;
  format: (v: number) => string;
  onChange: (v: number | null) => void;
  /** Saisie libre quand le champ est rempli (sélecteur d'heure natif, clavier numérique). */
  free?: { type: 'time' | 'number'; toInput: (v: number) => string; fromInput: (s: string) => number | null };
}

export function Stepper({ label, value, ghost, ghostHint, step, min, max, wrap, format, onChange, free }: StepperProps) {
  const span = max - min;
  const move = (dir: 1 | -1) => {
    let v = (value ?? ghost) + dir * step;
    if (wrap) v = ((((v - min) % span) + span) % span) + min;
    else v = Math.min(max, Math.max(min, v));
    onChange(v);
  };
  const id = `f-${label}`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper">
        <button type="button" className="step" aria-label={`${label} moins ${step}`} onClick={() => move(-1)}>
          −
        </button>
        {value === null ? (
          <button
            type="button"
            id={id}
            className="value ghost"
            aria-label={`${label} : valider ${format(ghost)} (${ghostHint})`}
            onClick={() => onChange(ghost)}
          >
            {format(ghost)}
            <small>{ghostHint}</small>
          </button>
        ) : free?.type === 'time' ? (
          // Valeur affichée en HH:MM quel que soit le format du téléphone ; le sélecteur natif est posé dessus.
          <span className="value value-overlay">
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
        ) : free ? (
          <input
            id={id}
            className="value"
            type={free.type}
            inputMode={free.type === 'number' ? 'numeric' : undefined}
            min={free.type === 'number' ? min : undefined}
            max={free.type === 'number' ? max : undefined}
            value={free.toInput(value)}
            onChange={(e) => {
              const v = free.fromInput(e.target.value);
              if (v !== null) onChange(Math.min(max, Math.max(min, v)));
            }}
          />
        ) : (
          <output id={id} className="value">
            {format(value)}
          </output>
        )}
        <button type="button" className="step" aria-label={`${label} plus ${step}`} onClick={() => move(1)}>
          +
        </button>
      </div>
      <button
        type="button"
        className="clear"
        aria-label={`Effacer ${label}`}
        onClick={() => onChange(null)}
        style={{ visibility: value === null ? 'hidden' : 'visible' }}
      >
        ×
      </button>
    </div>
  );
}
