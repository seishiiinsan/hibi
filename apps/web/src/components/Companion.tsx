import { moodForScore } from '@hibi/domain';
import { useAvatar } from '../hooks';
import { AvatarView } from './AvatarView';

/** L'avatar sur l'écran de saisie : son visage suit le score du jour (la personnalisation s'ouvre depuis l'icône pousse). */
export function Companion({ score, off, perfect }: { score: number | null; off: boolean; perfect: boolean }) {
  const cfg = useAvatar();
  return (
    <div className="companion">
      <AvatarView config={cfg} width={200} mood={moodForScore(score, off)} joy={perfect} label={false} />
    </div>
  );
}
