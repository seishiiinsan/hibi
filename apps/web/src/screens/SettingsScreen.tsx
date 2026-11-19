import { CRITERIA, validateSettings, type Criterion, type Settings } from '@hibi/domain';
import { useEffect, useState } from 'react';
import { logout, saveSettings } from '../api';
import { TopBar } from '../components/TopBar';
import { useKV, useSettings, useSyncInfo } from '../hooks';

const LABELS: Record<Criterion, string> = { bedtime: 'Coucher', sleep: 'Sommeil', dev: 'Dev', reading: 'Lecture' };

export function SettingsScreen() {
  const settings = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [message, setMessage] = useState<string | null>(null);
  const lastSyncAt = useKV<string | null>('lastSyncAt', null);
  const { pending } = useSyncInfo();

  useEffect(() => setForm(settings), [settings]);

  const num = (s: string) => (s === '' ? NaN : Number(s.replace(',', '.')));
  const errors = validateSettings(form);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (errors.length) return;
    const res = await saveSettings(form);
    setMessage(res.ok ? 'Réglages enregistrés : tout l’historique est recalculé.' : (res.message ?? 'Erreur'));
  };

  const onLogout = async () => {
    if (pending > 0 && !confirm(`${pending} journée(s) pas encore synchronisée(s) seront perdues. Se déconnecter ?`)) return;
    await logout();
  };

  return (
    <div className="screen">
      <TopBar title="Réglages" />
      <form className="settings" onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>Objectifs</legend>
          <label>
            Coucher au plus tard
            <input
              type="time"
              value={form.bedtimeTarget}
              onChange={(e) => setForm({ ...form, bedtimeTarget: e.target.value })}
              aria-invalid={errors.includes('bedtimeTarget')}
            />
          </label>
          <label>
            Tolérance du coucher (h)
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0.5"
              value={Number.isNaN(form.bedtimeToleranceH) ? '' : form.bedtimeToleranceH}
              onChange={(e) => setForm({ ...form, bedtimeToleranceH: num(e.target.value) })}
              aria-invalid={errors.includes('bedtimeToleranceH')}
            />
          </label>
          <label>
            Sommeil (h)
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0.5"
              value={Number.isNaN(form.sleepTargetH) ? '' : form.sleepTargetH}
              onChange={(e) => setForm({ ...form, sleepTargetH: num(e.target.value) })}
              aria-invalid={errors.includes('sleepTargetH')}
            />
          </label>
          <label>
            Dev (min)
            <input
              type="number"
              inputMode="numeric"
              step="15"
              min="15"
              value={Number.isNaN(form.devTargetMin) ? '' : form.devTargetMin}
              onChange={(e) => setForm({ ...form, devTargetMin: num(e.target.value) })}
              aria-invalid={errors.includes('devTargetMin')}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Poids dans le score</legend>
          {CRITERIA.map((c) => (
            <label key={c}>
              {LABELS[c]}
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                value={Number.isNaN(form.weights[c]) ? '' : form.weights[c]}
                onChange={(e) => setForm({ ...form, weights: { ...form.weights, [c]: num(e.target.value) } })}
                aria-invalid={errors.includes('weights')}
              />
            </label>
          ))}
        </fieldset>
        {errors.length > 0 && <p className="form-error">Valeurs invalides : vérifie les champs en rouge.</p>}
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button type="submit" className="primary" disabled={errors.length > 0}>
          Enregistrer
        </button>
      </form>

      <section className="settings-extra">
        <a className="button" href="/api/export.csv" download>
          Exporter en CSV
        </a>
        <p className="muted">
          Dernière synchro : {lastSyncAt ? new Date(lastSyncAt).toLocaleString('fr-FR') : 'jamais'}
        </p>
        <button type="button" className="danger" onClick={onLogout}>
          Se déconnecter
        </button>
      </section>
    </div>
  );
}
