import { describe, expect, it } from '@rstest/core';

import type { LyricLine } from '../models.js';
import { findLyricIndex, isSyncedLyrics, sortLyrics } from '../lyrics.js';
import { normalizeQuery, mergeById, pushHistory, relevanceScore, rewriteSuggestions } from '../search.js';
import { formatArtists, formatCount, formatDuration, greetingFor } from '../format.js';
import { AppError, CancellationError, isCancellation } from '../errors.js';

const LINES: LyricLine[] = [
  { startMs: 30_000, text: 'third' },
  { startMs: 0, text: 'first' },
  { startMs: 15_000, text: 'second', translation: '第二行' },
];

describe('lyrics', () => {
  it('sorts by start time without mutating the input', () => {
    const sorted = sortLyrics(LINES);
    expect(sorted.map((l) => l.text)).toEqual(['first', 'second', 'third']);
    expect(LINES[0]!.text).toBe('third');
  });

  it('binary-searches the active line', () => {
    const sorted = sortLyrics(LINES);
    expect(findLyricIndex(sorted, 0)).toBe(0);
    expect(findLyricIndex(sorted, 14_999)).toBe(0);
    expect(findLyricIndex(sorted, 15_000)).toBe(1);
    expect(findLyricIndex(sorted, 29_999)).toBe(1);
    expect(findLyricIndex(sorted, 30_000)).toBe(2);
    expect(findLyricIndex(sorted, 999_999)).toBe(2);
  });

  it('returns -1 before the first line', () => {
    // A line at 0ms means position 0 already matches; an all-later set does not.
    expect(findLyricIndex([{ startMs: 5_000, text: 'a' }], 0)).toBe(-1);
  });

  it('handles an empty list', () => {
    expect(findLyricIndex([], 1_000)).toBe(-1);
  });

  it('detects unsynced lyrics', () => {
    expect(isSyncedLyrics(sortLyrics(LINES))).toBe(true);
    expect(isSyncedLyrics([{ startMs: 0, text: 'a' }, { startMs: 0, text: 'b' }])).toBe(false);
  });
});

describe('search helpers', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  晚风   经过 ')).toBe('晚风 经过');
  });

  it('keeps history newest-first, de-duplicated and capped at 20', () => {
    let history: string[] = [];
    history = pushHistory(history, 'a');
    history = pushHistory(history, 'b');
    history = pushHistory(history, 'a');
    expect(history).toEqual(['a', 'b']);

    for (let i = 0; i < 30; i++) history = pushHistory(history, `q${i}`);
    expect(history).toHaveLength(20);
    expect(history[0]).toBe('q29');
  });

  it('ignores blank history entries', () => {
    expect(pushHistory(['a'], '   ')).toEqual(['a']);
  });

  it('merges pages without duplicating ids', () => {
    const merged = mergeById([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('scores exact title above prefix above substring above artist', () => {
    const track = { title: '晚风经过操场', artists: [{ name: '林听白' }], album: { title: '十七岁的夏天' } };
    expect(relevanceScore(track, '晚风经过操场')).toBe(100);
    expect(relevanceScore(track, '晚风')).toBe(80);
    expect(relevanceScore(track, '经过操场')).toBe(60);
    expect(relevanceScore(track, '林听白')).toBe(40);
    expect(relevanceScore(track, '十七岁')).toBe(30);
    expect(relevanceScore(track, '无关')).toBe(0);
  });

  it('suggests a rewrite for a query with no hits', () => {
    const suggestions = rewriteSuggestions('晚凤经过操场', ['晚风经过操场', '晚风经过操场']);
    expect(suggestions[0]).toBe('晚风经过操场');
  });

  it('returns nothing for an empty query', () => {
    expect(rewriteSuggestions('  ', ['a'])).toEqual([]);
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-1)).toBe('--:--');
    expect(formatDuration(Number.NaN)).toBe('--:--');
  });

  it('formats Chinese counts', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_500)).toBe('1.5千');
    expect(formatCount(23_400)).toBe('2万');
    expect(formatCount(130_000_000)).toBe('1.3亿');
  });

  it('falls back to 未知歌手', () => {
    expect(formatArtists([])).toBe('未知歌手');
    expect(formatArtists(['A', 'B'])).toBe('A / B');
  });

  it('greets by time of day', () => {
    expect(greetingFor(3)).toBe('夜深了');
    expect(greetingFor(9)).toBe('早上好');
    expect(greetingFor(12)).toBe('中午好');
    expect(greetingFor(15)).toBe('下午好');
    expect(greetingFor(21)).toBe('晚上好');
  });
});

describe('AppError', () => {
  it('carries user copy and keeps debug detail out of it', () => {
    const error = new AppError('network', '网络不太顺畅', { debugDetail: 'ECONNRESET' });
    expect(error.kind).toBe('network');
    expect(error.userMessage).toBe('网络不太顺畅');
    expect(error.message).not.toContain('ECONNRESET');
    expect(error.debugDetail).toBe('ECONNRESET');
  });

  it('wraps unknown errors', () => {
    const wrapped = AppError.from(new TypeError('boom'));
    expect(wrapped.kind).toBe('unknown');
    expect(wrapped.debugDetail).toBe('boom');
  });

  it('passes an existing AppError through untouched', () => {
    const original = new AppError('timeout', '超时了');
    expect(AppError.from(original)).toBe(original);
  });

  it('recognises cancellation so it never renders an error state', () => {
    expect(isCancellation(new CancellationError())).toBe(true);
    expect(isCancellation({ name: 'AbortError' })).toBe(true);
    expect(isCancellation(new AppError('unknown', 'x', { cause: new CancellationError() }))).toBe(true);
    expect(isCancellation(new Error('real failure'))).toBe(false);
  });
});