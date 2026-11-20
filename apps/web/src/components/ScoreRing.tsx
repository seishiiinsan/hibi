import { scoreColor, toPercent } from '@hibi/domain';

interface ScoreRingProps {
  score: number | null;
  size?: number;
  stroke?: number;
  celebrate?: boolean;
  label?: string;
  /** Pour les tests : posé sur la valeur affichée (« 72 % »). */
  testId?: string;
}

export function ScoreRing({ score, size = 112, stroke = 10, celebrate = false, label = 'Score du jour', testId }: ScoreRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(1, score));
  return (
    <div
      className={`ring${size < 64 ? ' ring-sm' : ''}${celebrate ? ' celebrate' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} : ${score === null ? 'non calculé' : `${toPercent(score)} %`}`}
    >
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} style={{ stroke: 'var(--sunken)' }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ stroke: score === null ? 'transparent' : scoreColor(score) }}
        />
      </svg>
      <span className="ring-label" aria-hidden="true">
        <span className="ring-value num" data-testid={testId}>
          {score === null ? '—' : toPercent(score)}
          {score !== null && <small> %</small>}
        </span>
      </span>
    </div>
  );
}
