/**
 * Formatting layer. Product spec §9: "时间、数字、复数由格式化层处理",
 * wording is never assembled by concatenation in page components.
 */

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}千`;
  if (n < 100_000_000) return `${Math.floor(n / 10_000)}万`;
  return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
}

export function formatArtists(names: string[]): string {
  if (names.length === 0) return '未知歌手';
  return names.join(' / ');
}

/** Max two lines for body copy, one for card titles (product spec §6.2). */
export function clampLines(n: 1 | 2 = 2): number {
  return n;
}

export function greetingFor(hour: number): string {
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}