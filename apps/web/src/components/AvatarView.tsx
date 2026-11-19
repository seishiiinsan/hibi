import { avatarLayers, type AvatarConfig } from '@hibi/domain';

/**
 * L'avatar : les calques rendus en 3D (corps, objets, pet) empilés dans l'ordre du domaine.
 * Même caméra pour tous : aucune combinaison ne peut se décaler ou se chevaucher bizarrement.
 */
export function AvatarView({ config, width = 280, label = true }: { config: AvatarConfig; width?: number; label?: boolean }) {
  const layers = avatarLayers(config);
  return (
    <div
      className={`avatar-view${config.pet ? '' : ' solo'}`}
      style={{ width, height: (width * 750) / 1200 }}
      role={label ? 'img' : undefined}
      aria-label={label ? 'Ton avatar' : undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="avatar-shadow" aria-hidden="true" />
      {layers.map((l) => (
        <img key={l.file} src={`/avatar/${l.file}.webp`} alt="" draggable={false} className={`avatar-layer avatar-${l.kind}`} />
      ))}
    </div>
  );
}
