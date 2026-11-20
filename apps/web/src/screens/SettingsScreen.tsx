import { CRITERIA, validateSettings, type Criterion, type Settings } from '@hibi/domain';
import { BedDouble, BookOpen, CodeXml, Download, LogOut, Moon, Scale, Target, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logout, saveSettings } from '../api';
import { ReminderSection } from '../components/ReminderSection';
import { TopBar } from '../components/TopBar';
import { useKV, useSettings, useSyncInfo } from '../hooks';

const LABELS: Record<Criterion, [string, LucideIcon]> = {
  bedtime: ['Coucher', Moon],
  sleep: ['Sommeil', BedDouble],
  dev: ['Dev', CodeXml],
  reading: ['Lecture', BookOpen],
};

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <label className="row">
      <span className="field-label">
        <Icon size={18} aria-hidden="true" />
        {label}
      </span>
      {children}
    </label>
  );
}

export function SettingsScreen() {
  const settings = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [message, setMessage] = useState<string | null>(null);
  const lastSyncAt = useKV<string | null>('lastSyncAt', null);
  const { pending } = useSyncInfo();

  useEffect(() => setForm(settings), [settings]);

  const num = (s: string) => (s === '' ? NaN : Number(s.replace(',', '.')));
  const shown = (n: number) => (Number.isNaN(n) ? '' : n);
  const errors = validateSettings(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (errors.length) return;
    const res = await saveSettings(form);
    setMessage(res.ok ? 'Enregistré : tout l’historique est recalculé.' : (res.message ?? 'Erreur'));
  };

  const onLogout = async () => {
    if (pending > 0 && !confirm(`${pending} journée(s) pas encore synchronisée(s) seront perdues. Se déconnecter ?`)) return;
    await logout();
  };

  return (
    <div className="screen">
      <TopBar title="Réglages" />
      <form className="screen-form" onSubmit={onSubmit} noValidate style={{ display: 'contents' }}>
        <section className="card section">
          <h2 className="section-title">
            <Target size={14} aria-hidden="true" />
            Objectifs
          </h2>
          <Row icon={Moon} label="Coucher avant">
            <span className="time-field">
              {form.bedtimeTarget}
              <input
                type="time"
                value={form.bedtimeTarget}
                onChange={(e) => e.target.value && setForm({ ...form, bedtimeTarget: e.target.value })}
                aria-invalid={errors.includes('bedtimeTarget')}
              />
            </span>
          </Row>
          <Row icon={Moon} label="Tolérance (h)">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0.5"
              value={shown(form.bedtimeToleranceH)}
              onChange={(e) => setForm({ ...form, bedtimeToleranceH: num(e.target.value) })}
              aria-invalid={errors.includes('bedtimeToleranceH')}
            />
          </Row>
          <Row icon={BedDouble} label="Sommeil (h)">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0.5"
              value={shown(form.sleepTargetH)}
              onChange={(e) => setForm({ ...form, sleepTargetH: num(e.target.value) })}
              aria-invalid={errors.includes('sleepTargetH')}
            />
          </Row>
          <Row icon={CodeXml} label="Dev (min)">
            <input
              type="number"
              inputMode="numeric"
              step="15"
              min="15"
              value={shown(form.devTargetMin)}
              onChange={(e) => setForm({ ...form, devTargetMin: num(e.target.value) })}
              aria-invalid={errors.includes('devTargetMin')}
            />
          </Row>
        </section>

        <section className="card section">
          <h2 className="section-title">
            <Scale size={14} aria-hidden="true" />
            Poids dans le score
          </h2>
          {CRITERIA.map((c) => (
            <Row key={c} icon={LABELS[c][1]} label={LABELS[c][0]}>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                value={shown(form.weights[c])}
                onChange={(e) => setForm({ ...form, weights: { ...form.weights, [c]: num(e.target.value) } })}
                aria-invalid={errors.includes('weights')}
              />
            </Row>
          ))}
        </section>

        <ReminderSection />

        <div className="actions">
          {errors.length > 0 && <p className="form-error">Valeurs invalides : vérifie les champs en rouge.</p>}
          {message && (
            <p className="form-message" role="status">
              {message}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={errors.length > 0 || !dirty}>
            Enregistrer
          </button>
          <a className="btn btn-secondary" href="/api/export.csv" download>
            <Download size={18} aria-hidden="true" />
            Exporter en CSV
          </a>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            <LogOut size={18} aria-hidden="true" />
            Se déconnecter
          </button>
          <p className="footnote">
            Dernière synchro : {lastSyncAt ? new Date(lastSyncAt).toLocaleString('fr-FR') : 'jamais'}
          </p>
        </div>
      </form>
    </div>
  );
}
