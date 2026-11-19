// Échelle de couleurs par défaut de Google Sheets : rouge 0 %, jaune 50 %, vert 100 %, en dégradé linéaire.
const RED = [0xe6, 0x7c, 0x73] as const;
const YELLOW = [0xff, 0xd6, 0x66] as const;
const GREEN = [0x57, 0xbb, 0x8a] as const;

const lerp = (a: readonly number[], b: readonly number[], t: number) =>
  a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * t));

export function scoreColor(score: number): string {
  const t = Math.min(1, Math.max(0, score));
  const rgb = t <= 0.5 ? lerp(RED, YELLOW, t / 0.5) : lerp(YELLOW, GREEN, (t - 0.5) / 0.5);
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
