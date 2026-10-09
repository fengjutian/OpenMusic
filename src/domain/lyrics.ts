/**
 * Lyric line lookup (technical spec §10.3): sort by `startMs`, binary search the
 * active line. Never scan the whole table on a 250ms progress tick.
 */

import type { LyricLine } from './models.js';

export function sortLyrics(lines: LyricLine[]): LyricLine[] {
  return lines.slice().sort((a, b) => a.startMs - b.startMs);
}

/**
 * @returns index of the last line with `startMs <= positionMs`, or -1 when the
 *          position precedes the first line.
 */
export function findLyricIndex(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = lines[mid]!;
    if (line.startMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function isSyncedLyrics(lines: LyricLine[]): boolean {
  return lines.some((l) => Number.isFinite(l.startMs) && l.startMs > 0);
}

/**
 * Auto-follow should stop for `ms` after the user starts scrolling, so they can
 * read ahead without the view fighting them (spec §10.3 / §7.8).
 */
export const LYRIC_FOLLOW_PAUSE_MS = 4000;