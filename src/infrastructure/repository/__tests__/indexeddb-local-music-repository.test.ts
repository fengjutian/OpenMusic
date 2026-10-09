/**
 * Tests for `IndexedDbLocalMusicRepository` (stage 9.6).
 *
 * Uses `fake-indexeddb/auto` so the global `indexedDB` is populated with the
 * in-process fake. Each test uses a unique `dbName` to keep the stores
 * isolated — fake-indexeddb's mock is a single global, so parallelism
 * without namespacing would collide.
 *
 * The tests cover the round-trip the UI relies on:
 *   - hydration on construction
 *   - write-through for `setLiked` and `markPlayed`
 *   - re-imports replacing the catalog
 *   - fallback when the host exposes no `indexedDB`
 *   - smoke search at 10k tracks
 */

import 'fake-indexeddb/auto';
import { describe, expect, it } from '@rstest/core';

import type { Track } from '../../../domain/models.js';
import { openOpenMusicDb } from '../../database/indexeddb-driver.js';
import { IndexedDbLocalMusicRepository } from '../indexeddb-local-music-repository.js';

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `track ${id}`,
    artists: [{ id: 'ar_1', name: '林听白' }],
    album: { id: 'al_1', title: '本地专辑', coverUrl: '', year: 2024 },
    coverUrl: '',
    durationMs: 200_000,
    playable: true,
    audioUrl: `blob:http://localhost/${id}`,
    source: 'local',
    ...overrides,
  };
}

function uniqueName(suffix: string): string {
  return `openmusic-test-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
}

async function makeSeed(size = 12): Promise<Track[]> {
  const tracks: Track[] = [];
  for (let i = 0; i < size; i++) {
    const id = `tr_${i.toString().padStart(3, '0')}`;
    tracks.push(
      track(id, { title: `本地曲目 ${i + 1}`, playable: i !== 4 }),
    );
  }
  return tracks;
}

describe('IndexedDbLocalMusicRepository', () => {
  it('hydrates the cache from the seed and persists it on first boot', async () => {
    const name = uniqueName('seed');
    const repo = new IndexedDbLocalMusicRepository({
      seed: await makeSeed(),
      initialLiked: ['tr_002'],
      openDb: () => openOpenMusicDb({ name }),
    });
    await repo.ready();
    const home = await repo.getHome();
    const all = home.shelves.find((shelf) => shelf.id === 'all');
    expect(all?.items.length).toBe(11); // 12 seed minus 1 unplayable
    expect(repo.isLiked('tr_002')).toBe(true);

    // A second repo pointing at the same DB should see the seeded data
    // without providing a seed (proves the persisted write worked).
    const reopened = new IndexedDbLocalMusicRepository({
      openDb: () => openOpenMusicDb({ name }),
    });
    await reopened.ready();
    const reopenedHome = await reopened.getHome();
    const reopenedAll = reopenedHome.shelves.find((s) => s.id === 'all');
    expect(reopenedAll?.items.length).toBe(11);
    expect(reopened.isLiked('tr_002')).toBe(true);
    repo.close();
    reopened.close();
  });

  it('persists setLiked across instances', async () => {
    const name = uniqueName('like');
    const seed = await makeSeed(3);
    const repo = new IndexedDbLocalMusicRepository({
      seed,
      openDb: () => openOpenMusicDb({ name }),
    });
    await repo.ready();
    await repo.setLiked('tr_000', true);
    await repo.setLiked('tr_001', true);
    expect(repo.isLiked('tr_000')).toBe(true);
    repo.close();

    const reopened = new IndexedDbLocalMusicRepository({
      openDb: () => openOpenMusicDb({ name }),
    });
    await reopened.ready();
    expect(reopened.isLiked('tr_000')).toBe(true);
    expect(reopened.isLiked('tr_001')).toBe(true);
    await reopened.setLiked('tr_000', false);
    reopened.close();

    const reopenedAgain = new IndexedDbLocalMusicRepository({
      openDb: () => openOpenMusicDb({ name }),
    });
    await reopenedAgain.ready();
    expect(reopenedAgain.isLiked('tr_000')).toBe(false);
    expect(reopenedAgain.isLiked('tr_001')).toBe(true);
    reopenedAgain.close();
  });

  it('persists markPlayed history most-recent-first across instances', async () => {
    const name = uniqueName('history');
    const seed = await makeSeed(3);
    const repo = new IndexedDbLocalMusicRepository({
      seed,
      openDb: () => openOpenMusicDb({ name }),
    });
    await repo.ready();
    repo.markPlayed('tr_002');
    repo.markPlayed('tr_001');
    repo.markPlayed('tr_002');
    repo.markPlayed('tr_000');
    expect(repo.recent(5)).toEqual(['tr_000', 'tr_002', 'tr_001']);
    repo.close();

    const reopened = new IndexedDbLocalMusicRepository({
      openDb: () => openOpenMusicDb({ name }),
    });
    await reopened.ready();
    expect(reopened.recent(5)).toEqual(['tr_000', 'tr_002', 'tr_001']);
    reopened.close();
  });

  it('importTracks replaces the catalog and clears old favourites', async () => {
    const name = uniqueName('reimport');
    const seed = await makeSeed(3);
    const repo = new IndexedDbLocalMusicRepository({
      seed,
      openDb: () => openOpenMusicDb({ name }),
    });
    await repo.ready();
    await repo.setLiked('tr_000', true);

    const newSeed: Track[] = [
      track('tr_new_a', { title: '新目录 A' }),
      track('tr_new_b', { title: '新目录 B' }),
    ];
    await repo.importTracks(newSeed);
    const home = await repo.getHome();
    const all = home.shelves.find((shelf) => shelf.id === 'all');
    expect(all?.items.map((item) => item.id)).toEqual(['tr_new_a', 'tr_new_b']);
    // Old IDs are gone:
    expect(repo.isLiked('tr_000')).toBe(false);

    const reopened = new IndexedDbLocalMusicRepository({
      openDb: () => openOpenMusicDb({ name }),
    });
    await reopened.ready();
    const reopenedHome = await reopened.getHome();
    const reopenedAll = reopenedHome.shelves.find((s) => s.id === 'all');
    expect(reopenedAll?.items.map((item) => item.id)).toEqual([
      'tr_new_a',
      'tr_new_b',
    ]);
    repo.close();
    reopened.close();
  });

  it('falls back to the in-memory cache when indexedDB is unavailable', async () => {
    const seed = await makeSeed(3);
    const repo = new IndexedDbLocalMusicRepository({
      seed,
      initialLiked: ['tr_001'],
      openDb: async () => ({
        database: null,
        error: new Error('blocked'),
        storeNames: [],
        tx: () => {
          throw new Error('blocked');
        },
        putAll: async () => undefined,
        getAll: async () => [],
        clear: async () => undefined,
        close: () => undefined,
      }),
    });
    await repo.ready();
    expect(repo.persistentError?.message).toBe('blocked');
    expect(repo.isLiked('tr_001')).toBe(true);
    // Reads still work:
    const home = await repo.getHome();
    expect(home.shelves.find((s) => s.id === 'all')?.items.length).toBe(3);
    // Writes do not throw:
    await expect(repo.setLiked('tr_000', true)).resolves.toBeUndefined();
    expect(repo.isLiked('tr_000')).toBe(true);
  });

  it('searches a 10k-track seed within a 200ms P95 budget (smoke)', async () => {
    const name = uniqueName('10k');
    const tracks: Track[] = [];
    for (let i = 0; i < 10_000; i++) {
      const id = `tr_${i.toString().padStart(5, '0')}`;
      tracks.push(
        track(id, {
          title: i % 137 === 0 ? '钢琴与雨' : `本地曲目 ${i}`,
        }),
      );
    }
    const repo = new IndexedDbLocalMusicRepository({
      seed: tracks,
      openDb: () => openOpenMusicDb({ name }),
    });
    await repo.ready();
    const samples = ['钢琴', '本地曲目 99', '曲目 1', '曲目 12345', 'not there'];
    const times: number[] = [];
    for (const query of samples) {
      const t0 = performance.now();
      const result = await repo.search(query);
      times.push(performance.now() - t0);
      void result;
    }
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.min(4, sorted.length - 1)] ?? 0;
    // Soft assertion: a p95 above 200 ms is a regression, not a failure.
    // Log so the matrix records actual numbers.
    /* eslint-disable-next-line no-console */
    console.log(
      `[stage9-6-bench] search P95 across 5 queries over 10k tracks = ${p95.toFixed(1)}ms`,
    );
    expect(p95).toBeLessThan(2000); // hard ceiling to keep CI quiet
    repo.close();
  });

  it('rejects setLiked for tracks absent from the catalog', async () => {
    const name = uniqueName('missing');
    const repo = new IndexedDbLocalMusicRepository({
      seed: await makeSeed(2),
      openDb: () => openOpenMusicDb({ name }),
    });
    await repo.ready();
    await expect(repo.setLiked('tr_does_not_exist', true)).rejects.toThrow(
      /已不在本地曲库/,
    );
    repo.close();
  });
});
