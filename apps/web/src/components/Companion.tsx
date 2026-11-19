import { moodForScore, unlockLabel, type AvatarMood } from '@hibi/domain';
import { Gift } from 'lucide-react';
import { useAvatar, useNewUnlocks } from '../hooks';
import { AvatarView } from './AvatarView';

const LINES: Record<AvatarMood, string> = {
  sleepy: 'Je dors à moitié… une petite saisie pour me réveiller ?',
  neutral: 'Je suis prêt quand tu l’es.',
  happy: 'On est bien, là. Continue comme ça !',
};

/** L'avatar sur l'écran de saisie : son visage suit le score du jour, un tap ouvre sa personnalisation. */
export function Companion({ score, off, perfect }: { score: number | null; off: boolean; perfect: boolean }) {
  const cfg = useAvatar();
  const fresh = useNewUnlocks();
  const mood = moodForScore(score, off);
  const line = off ? 'Journée off : je me repose avec toi.' : perfect ? 'Journée pleine ! On fête ça !' : LINES[mood];
  return (
    <a className="card companion" href="#/avatar" aria-label="Personnaliser mon avatar">
      <AvatarView config={cfg} width={150} mood={mood} joy={perfect} label={false} />
      <span className="companion-bubble">
        {fresh.length > 0 ? (
          <>
            <Gift size={16} aria-hidden="true" />
            <b>{fresh.length === 1 ? 'Nouveau : ' : `${fresh.length} nouveautés : `}</b>
            {fresh.slice(0, 2).map(unlockLabel).join(', ')}
            {fresh.length > 2 ? '…' : ''}
          </>
        ) : (
          line
        )}
      </span>
    </a>
  );
}
