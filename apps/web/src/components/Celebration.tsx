import { PartyPopper, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { msSinceLocalEdit } from '../sync';

const MILESTONES = [7, 14, 30, 50, 100, 200, 365];

export interface Celebration {
  id: number;
  text: string;
  kind: 'perfect' | 'streak';
}

/**
 * Moment fort (peak-end) : une journée qui passe à 100 %, ou une série qui franchit un palier.
 * Ne se déclenche que sur une transition vue à l'écran, jamais à l'ouverture.
 */
export function useCelebration(ready: boolean, day: string, score: number | null, streaks: Record<string, number>) {
  const [current, setCurrent] = useState<Celebration | null>(null);
  const prev = useRef<{ day: string; score: number | null; streaks: Record<string, number> } | null>(null);

  useEffect(() => {
    // Tant que les données ne sont pas chargées, pas de référence : l'état chargé devient la base.
    if (!ready) {
      prev.current = null;
      return;
    }
    const p = prev.current;
    prev.current = { day, score, streaks };
    // Seul un geste fait ici à l'instant compte : une synchro qui rapatrie une journée parfaite ne célèbre rien.
    if (!p || p.day !== day || msSinceLocalEdit() > 2000) return;
    if (score !== null && score >= 0.9999 && (p.score === null || p.score < 0.9999)) {
      setCurrent({ id: Date.now(), text: 'Journée parfaite !', kind: 'perfect' });
      navigator.vibrate?.(30);
      return;
    }
    for (const [name, n] of Object.entries(streaks)) {
      const m = MILESTONES.find((x) => (p.streaks[name] ?? 0) < x && n >= x);
      if (m) {
        setCurrent({ id: Date.now(), text: `${m} jours de suite en ${name} !`, kind: 'streak' });
        navigator.vibrate?.(30);
        return;
      }
    }
  }, [ready, day, score, streaks]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), 2600);
    return () => clearTimeout(t);
  }, [current]);

  return current;
}

export function CelebrationToast({ celebration }: { celebration: Celebration | null }) {
  if (!celebration) return null;
  const Icon = celebration.kind === 'perfect' ? Sparkles : PartyPopper;
  return (
    <div key={celebration.id} className="toast" role="status" aria-live="polite">
      <Icon size={20} />
      {celebration.text}
    </div>
  );
}
