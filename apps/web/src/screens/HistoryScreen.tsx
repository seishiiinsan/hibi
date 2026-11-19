import { addDays, dayScore, parisNow, sevenDayScore, streak, toPercent } from '@hibi/domain';
import { BedDouble, BookOpen, CodeXml, Coffee, Moon, Plus } from 'lucide-react';
import { ScoreBadge } from '../components/ScoreBadge';
import { ScoreRing } from '../components/ScoreRing';
import { TopBar } from '../components/TopBar';
import { formatDay, formatHours, formatMinutes } from '../format';
import { useEntries, useNow, useSettings } from '../hooks';

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
            <dt>Série lecture</dt>
            <dd className="num">{streak(index, 'reading', today, settings)}</dd>
          </div>
        </dl>
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
