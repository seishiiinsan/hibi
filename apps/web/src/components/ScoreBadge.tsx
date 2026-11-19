import { scoreColor, toPercent } from '@hibi/domain';

export function ScoreBadge({ score }: { score: number | null }) {
  return (
    <span className={`pill${score === null ? ' pill-empty' : ''}`} style={score === null ? undefined : { background: scoreColor(score) }}>
      {score === null ? '—' : `${toPercent(score)} %`}
    </span>
  );
}
