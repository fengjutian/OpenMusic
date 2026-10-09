import { describe, expect, it } from '@rstest/core';

import type { Track } from '../../../domain/models.js';
import { LocalMusicRepository } from '../local-music-repository.js';

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

function setup() {
  const tracks = [
    track('tr_01', { title: '晚风经过操场' }),
    track('tr_02', { title: '把雨声留在耳机里' }),
    track('tr_03', { title: '钢琴与雨' }),
    track('tr_04', { title: 'broken', playable: false, audioUrl: undefined }),
  ];
  return new LocalMusicRepository({ tracks, initialLiked: ['tr_02'] });
}

describe('LocalMusicRepository', () => {
  it('throws when tracks list is missing', () => {
    // @ts-expect-error: validating runtime guard
    expect(() => new LocalMusicRepository({})).toThrow(/tracks.*required/);
  });

  it('getHome returns shelves sized to playable tracks', async () => {
    const repo = setup();
    const home = await repo.getHome();
    expect(home.shelves.map((s) => s.id)).toEqual(['recent', 'all']);
    expect(home.shelves[1]!.items.length).toBe(3);
  });

  it('search only returns playable tracks', async () => {
    const repo = setup();
    const result = await repo.search('钢琴');
    expect(result.tracks.map((t) => t.id)).toEqual(['tr_03']);
  });

  it('listTracks respects cursor pagination', async () => {
    const repo = setup();
    const first = await repo.listTracks(undefined, 2);
    expect(first.items.map((t) => t.id)).toEqual(['tr_01', 'tr_02']);
    expect(first.hasMore).toBe(true);
    const next = await repo.listTracks(first.nextCursor, 2);
    expect(next.items.map((t) => t.id)).toEqual(['tr_03']);
    expect(next.hasMore).toBe(false);
  });

  it('setLiked / isLiked round-trip', async () => {
    const repo = setup();
    expect(repo.isLiked('tr_02')).toBe(true);
    expect(repo.isLiked('tr_01')).toBe(false);
    await repo.setLiked('tr_01', true);
    expect(repo.isLiked('tr_01')).toBe(true);
    await repo.setLiked('tr_02', false);
    expect(repo.isLiked('tr_02')).toBe(false);
  });

  it('setLiked throws for a track not in the library', async () => {
    const repo = setup();
    await expect(repo.setLiked('tr_missing', true)).rejects.toThrow(
      /已不在本地曲库/,
    );
  });

  it('markPlayed keeps history bounded and most-recent-first', () => {
    const repo = setup();
    for (const id of ['tr_02', 'tr_03', 'tr_02', 'tr_01']) {
      repo.markPlayed(id);
    }
    expect(repo.recent()).toEqual(['tr_01', 'tr_02', 'tr_03']);
  });

  it('getPlaylist("pl_liked") returns the liked subset only', async () => {
    const repo = setup();
    const pl = await repo.getPlaylist('pl_liked');
    expect(pl.trackCount).toBe(1);
    expect((pl.tracks ?? []).map((t) => t.id)).toEqual(['tr_02']);
  });

  it('getPlaylist for an unknown id rejects', async () => {
    const repo = setup();
    await expect(repo.getPlaylist('pl_ghost')).rejects.toThrow(/不存在/);
  });
});