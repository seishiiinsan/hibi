export const TIME_ZONE = 'Europe/Paris';

/** Jour civil et heure à Paris pour un instant donné (ENF-09 : « aujourd'hui » se définit à Paris). */
export function parisNow(now: Date = new Date(), timeZone = TIME_ZONE): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Heure à laquelle la journée bascule : avant 4 h, on est encore dans la soirée de la veille. */
export const DAY_START_HOUR = 4;

/**
 * EF-02 : l'écran ouvre la ligne du jour. La nuit de J−1 à J est sur la ligne J, donc le matin
 * on saisit la nuit sur la ligne du jour ; avant 4 h, on reste sur la veille (dev et lecture du soir).
 */
export function defaultDay(now: Date = new Date()): string {
  const { day, hour } = parisNow(now);
  return hour < DAY_START_HOUR ? addDays(day, -1) : day;
}

/** Jours de `from` à `to` inclus, dans l'ordre. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
