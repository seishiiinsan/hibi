import { addDays, bestStreak, dayScore, defaultDay, parisNow, sevenDayScore, streak, toPercent, type Criterion } from '@hibi/domain';
import { BedDouble, BookOpen, CodeXml, Coffee, Flame, Moon, Plus, Trophy, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { ScoreBadge } from '../components/ScoreBadge';
import { ScoreRing } from '../components/ScoreRing';
import { TopBar } from '../components/TopBar';
import { formatDay, formatHours, formatMinutes } from '../format';
import { useEntries, useNow, useSettings } from '../hooks';

const STREAKS: { c: Criterion; label: string; unit: [string, string]; icon: LucideIcon; tone: string }[] = [
  { c: 'reading', label: 'Lecture', unit: ['jour', 'jours'], icon: BookOpen, tone: 'sage' },
  { c: 'dev', label: 'Dev', unit: ['jour', 'jours'], icon: CodeXml, tone: 'butter' },
  { c: 'sleep', label: 'Sommeil', unit: ['nuit', 'nuits'], icon: BedDouble, tone: 'sky' },
  { c: 'bedtime', label: 'Coucher', unit: ['soir', 'soirs'], icon: Moon, tone: 'lilac' },
];

export function HistoryScreen() {
  const now = useNow();
  const settings = useSettings();
  const { index } = useEntries();
  const today = parisNow(now).day;
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -i));

  const scores = days.map((d) => dayScore(index.get(d), settings)).filter((s): s is number => s !== null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const logged = days.filter((d) => index.has(d)).length;
  const perfect = scores.filter((s) => s >= 0.9999).length;
  const week = sevenDayScore(index, today, settings);
  const offDays = days.filter((d) => index.get(d)?.off).length;
  // Même jour de référence que l'accueil : avant l'heure de bascule, la série court encore sur la veille.
  const refDay = defaultDay(now);
  const series = useMemo(
    () => STREAKS.map((x) => ({ ...x, current: streak(index, x.c, refDay, settings), best: bestStreak(index, x.c, settings) })),
    [index, refDay, settings],
  );

  return (
    <div className="screen">
      <TopBar title="30 derniers jours" />

      <section className="card stats" aria-label="Bilan 30 jours">
        <ScoreRing score={avg} size={88} stroke={8} label="Moyenne 30 jours" />
        <dl>
          <div>
            <dt>Jours saisis</dt>
            <dd className="num">{logged}/30</dd>
          </div>
          <div>
            <dt>Journées à 100 %</dt>
            <dd className="num">{perfect}</dd>
          </div>
          <div>
            <dt>Moyenne 7 j</dt>
            <dd className="num">{week === null ? '—' : `${toPercent(week)} %`}</dd>
          </div>
          <div>
            <dt>Journées off</dt>
            <dd className="num">{offDays}</dd>
          </div>
        </dl>
      </section>

      <section className="card series" aria-label="Séries">
        <h2 className="section-title">
          <Flame size={14} aria-hidden="true" />
          Séries en cours
        </h2>
        <ul>
          {series.map(({ c, label, unit, icon: Icon, tone, current, best }) => (
            <li key={c} className={`serie serie-${tone}${current >= 3 ? ' hot' : ''}${current > 0 && current >= best ? ' record' : ''}`}>
              <span className="serie-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="serie-label">{label}</span>
              <span className="serie-current">
                <b className="num">{current}</b> {current > 1 ? unit[1] : unit[0]}
              </span>
              <span className="serie-best">
                <Trophy size={12} aria-hidden="true" />
                {current > 0 && current >= best ? 'record en cours' : <>record <b className="num">{best}</b></>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ul className="card history">
        {days.map((day) => {
          const e = index.get(day);
          if (!e) {
            return (
              <li key={day}>
                <a href={`#/jour/${day}`} className="history-row missing">
                  <span className="history-text">
                    <span className="history-day">{formatDay(day)}</span>
                    <span className="history-detail">Non saisi</span>
                  </span>
                  <span className="pill pill-add">
                    <Plus size={14} aria-hidden="true" />
                    Saisir
                  </span>
                </a>
              </li>
            );
          }
          return (
            <li key={day}>
              <a href={`#/jour/${day}`} className="history-row">
                <span className="history-text">
                  <span className="history-day">{formatDay(day)}</span>
                  <span className="history-detail">
                    {e.off ? (
                      <span>
                        <Coffee size={12} aria-hidden="true" /> Off
                      </span>
                    ) : (
                      <>
                        {e.bedtime && (
                          <span>
                            <Moon size={12} aria-hidden="true" /> {e.bedtime}
                          </span>
                        )}
                        {e.sleepH !== null && (
                          <span>
                            <BedDouble size={12} aria-hidden="true" /> {formatHours(e.sleepH)}
                          </span>
                        )}
                        {e.devMin !== null && (
                          <span>
                            <CodeXml size={12} aria-hidden="true" /> {formatMinutes(e.devMin)}
                          </span>
                        )}
                        {e.reading && (
                          <span>
                            <BookOpen size={12} aria-hidden="true" /> lu
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </span>
                <ScoreBadge score={dayScore(e, settings)} />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
