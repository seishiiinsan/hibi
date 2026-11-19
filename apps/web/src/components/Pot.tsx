import { scoreColor, toPercent } from '@hibi/domain';

/** Le pot : la plante grandit avec le score du jour, le pot prend le code couleur du Sheet (EF-04). */
export function Pot({ score, celebrate = false, size = 96 }: { score: number | null; celebrate?: boolean; size?: number }) {
  const s = score === null ? 0 : Math.max(0, Math.min(1, score));
  const plantScale = score === null ? 0.25 : 0.4 + 0.6 * s;
  return (
    <svg
      className={`pot${celebrate ? ' celebrate' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Score du jour : ${score === null ? 'pas encore calculé' : `${toPercent(score)} %`}`}
    >
      <g className="plant" style={{ transform: `scale(${plantScale})`, ['--plant-scale' as string]: plantScale }}>
        <path d="M60 64 C60 50 60 40 60 30" stroke="var(--stem)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M60 46 C46 46 37 36 38 24 C51 24 60 33 60 46Z" fill="var(--leaf-1)" />
        <path d="M60 36 C73 35 82 25 81 13 C68 14 60 23 60 36Z" fill="var(--leaf-2)" />
      </g>
      <rect x="24" y="62" width="72" height="14" rx="7" fill="var(--pot-rim)" />
      <path
        className="pot-body"
        d="M30 76 H90 L83 112 Q82 116 78 116 H42 Q38 116 37 112 Z"
        fill={score === null ? 'var(--pot)' : scoreColor(score)}
      />
      <text
        x="60"
        y="101"
        textAnchor="middle"
        fontFamily="Fredoka, sans-serif"
        fontWeight="600"
        fontSize="16"
        fill="#2b2420"
        data-testid="day-score"
      >
        {score === null ? '—' : `${toPercent(score)} %`}
      </text>
    </svg>
  );
}
