import { moodForScore, unlockLabel } from '@hibi/domain';
import { Gift } from 'lucide-react';
import { useAvatar, useNewUnlocks } from '../hooks';
import { AvatarView } from './AvatarView';

/** L'avatar sur l'écran de saisie : son visage suit le score du jour, un tap ouvre sa personnalisation. */
export function Companion({ score, off, perfect }: { score: number | null; off: boolean; perfect: boolean }) {
  const cfg = useAvatar();
  return (
    <a className="companion" href="#/avatar" aria-label="Personnaliser mon avatar">
      <AvatarView config={cfg} width={128} mood={moodForScore(score, off)} joy={perfect} label={false} />
    </a>
  );
}

/** Une phrase sous l'avatar : les nouveautés à débloquer d'abord, sinon la prochaine étape. */
export function HeroMessage({ text }: { text: string }) {
  const fresh = useNewUnlocks();
  return (
    <p className="hero-msg">
      {fresh.length > 0 ? (
        <>
          <Gift size={16} aria-hidden="true" />
          <b>{fresh.length === 1 ? 'Nouveau : ' : `${fresh.length} nouveautés : `}</b>
          {fresh.slice(0, 2).map(unlockLabel).join(', ')}
          {fresh.length > 2 ? '…' : ''}
        </>
      ) : (
        text
      )}
    </p>
  );
}
