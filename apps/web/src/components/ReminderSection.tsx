import { Bell, BellRing, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  currentSubscription,
  disablePush,
  enablePush,
  fetchPushInfo,
  pushSupport,
  sendTestPush,
  setReminderTime,
  type PushInfo,
} from '../push';

const VALID_TIME = /^(1[2-9]|2[0-3]):[0-5]\d$/;

const SUPPORT_HINT = {
  'install-first': "Sur iPhone, les notifications ne marchent que dans l'app : Partager → « Sur l'écran d'accueil », puis active le rappel depuis l'icône Hibi.",
  unsupported: 'Ce navigateur ne gère pas les notifications.',
  denied: 'Notifications bloquées pour Hibi : autorise-les dans les réglages du téléphone, puis reviens ici.',
} as const;

/** Rappel du soir : activé par appareil, heure commune à tous les appareils. */
export function ReminderSection() {
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [time, setTime] = useState('22:00');
  const support = pushSupport();

  useEffect(() => {
    let alive = true;
    fetchPushInfo()
      .then(async (i) => {
        const sub = await currentSubscription();
        if (!alive) return;
        setInfo(i);
        setTime(i.time);
        setSubscribed(sub !== null);
      })
      .catch(() => alive && setMessage('Hors ligne : le rappel se règle avec le réseau.'));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
    } catch {
      setMessage('Échec : vérifie le réseau et réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = () =>
    run(async () => {
      if (!info) return null;
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
        return 'Rappel coupé sur cet appareil.';
      }
      if ((await enablePush(info.publicKey)) === 'denied') return SUPPORT_HINT.denied;
      setSubscribed(true);
      return `Rappel activé : chaque soir à ${time} s'il manque quelque chose.`;
    });

  const changeTime = (t: string) => {
    setTime(t);
    if (!VALID_TIME.test(t)) {
      setMessage("Choisis une heure entre 12:00 et 23:59 : le rappel porte sur la journée en cours.");
      return;
    }
    void run(async () => {
      await setReminderTime(t);
      return null;
    });
  };

  const test = () =>
    run(async () => {
      const { sent } = await sendTestPush();
      return sent > 0 ? 'Notification de test envoyée.' : 'Aucun appareil abonné.';
    });

  const usable = support === 'ok' && info !== null;

  return (
    <section className="card section" aria-label="Rappel du soir">
      <h2 className="section-title">
        <Bell size={14} aria-hidden="true" />
        Rappel du soir
      </h2>
      <div className="row">
        <span className="field-label">
          <BellRing size={18} aria-hidden="true" />
          Sur cet appareil
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={subscribed}
          aria-label="Rappel du soir sur cet appareil"
          className="switch"
          disabled={!usable || busy}
          onClick={() => void toggle()}
        >
          <span className="switch-thumb" aria-hidden="true" />
        </button>
      </div>
      <label className="row">
        <span className="field-label">
          <Clock size={18} aria-hidden="true" />
          Heure
        </span>
        <span className="time-field">
          {time}
          <input
            type="time"
            min="12:00"
            max="23:59"
            value={time}
            disabled={info === null}
            aria-invalid={!VALID_TIME.test(time)}
            onChange={(e) => e.target.value && changeTime(e.target.value)}
          />
        </span>
      </label>
      <p className="section-note">
        {support !== 'ok'
          ? SUPPORT_HINT[support]
          : "Envoyé une fois par soir s'il manque quelque chose dans la journée ; rien si elle est complète ou Off."}
      </p>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {subscribed && (
        <button type="button" className="btn btn-secondary section-btn" disabled={busy} onClick={() => void test()}>
          Envoyer un test
        </button>
      )}
    </section>
  );
}
