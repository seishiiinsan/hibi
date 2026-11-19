import { scoreColor, toPercent } from '@hibi/domain';

export function ScoreBadge({ score, size = 'lg' }: { score: number | null; size?: 'lg' | 'sm' }) {
  return (
    <span
      className={`score score-${size}${score === null ? ' score-empty' : ''}`}
      style={score === null ? undefined : { background: scoreColor(score) }}
    >
      {score === null ? '—' : `${toPercent(score)} %`}
    </span>
  );
}
