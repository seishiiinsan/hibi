import { moodForScore } from '@hibi/domain';
import { useAvatar } from '../hooks';
import { AvatarView } from './AvatarView';

/** L'avatar sur l'écran de saisie : son visage suit le score du jour, un tap ouvre sa personnalisation. */
export function Companion({ score, off, perfect }: { score: number | null; off: boolean; perfect: boolean }) {
  const cfg = useAvatar();
  return (
    <a className="companion" href="#/avatar" aria-label="Personnaliser mon avatar">
      <AvatarView config={cfg} width={200} mood={moodForScore(score, off)} joy={perfect} label={false} />
    </a>
  );
}
