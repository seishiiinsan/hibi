const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const formatDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));
export const formatDayLong = (day: string) => longFmt.format(new Date(`${day}T00:00:00Z`));

export const formatHours = (h: number) => `${String(h).replace('.', ',')} h`;
export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
