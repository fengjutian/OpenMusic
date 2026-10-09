/** Search helpers (technical spec §10.2). Pure, unit-tested. */

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_HISTORY_LIMIT = 20;

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isSearchable(query: string): boolean {
  return normalizeQuery(query).length > 0;
}

/** Newest first, de-duplicated by exact query, capped. */
export function pushHistory(history: string[], query: string): string[] {
  const q = normalizeQuery(query);
  if (!q) return history;
  return [q, ...history.filter((item) => item !== q)].slice(0, SEARCH_HISTORY_LIMIT);
}

/**
 * Merge a page into an accumulator without duplicating ids. Refresh must start
 * from an empty accumulator; "load more" appends (spec §10.1).
 */
export function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = existing.slice();
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

/**
 * Locale-insensitive relevance score. Deliberately simple: exact title first,
 * then prefix, then substring, then artist/album matches.
 */
export function relevanceScore(
  track: { title: string; artists?: { name: string }[]; album?: { title: string } },
  query: string,
): number {
  const q = query.toLowerCase();
  const title = track.title.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (track.artists?.some((a) => a.name.toLowerCase().includes(q))) return 40;
  if (track.album?.title.toLowerCase().includes(q)) return 30;
  return 0;
}

/** "No results for X" → suggest a real catalogue match, then a truncation. */
export function rewriteSuggestions(query: string, catalogue: string[]): string[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  // A real catalogue entry is a much better suggestion than a blind truncation,
  // so those come first.
  const sameLength = catalogue.filter((c) => c.length === q.length && c.startsWith(q[0]!));
  const out: string[] = [];
  for (const candidate of sameLength) {
    if (candidate !== q && !out.includes(candidate) && out.length < 3) out.push(candidate);
  }
  if (q.length > 1 && out.length < 3 && !out.includes(q.slice(0, -1))) {
    out.push(q.slice(0, -1));
  }
  return out;
}