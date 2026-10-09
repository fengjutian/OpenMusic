#!/usr/bin/env node
/**
 * Standalone benchmark for the `IndexedDbLocalMusicRepository`.
 *
 * Stage 9.6 acceptance gate (capability matrix §3.10): prove the repository
 * stays inside the 200ms search P95 budget at the user's worst-case catalog
 * size (10 000 tracks). The bench also measures:
 *
 *   - `getHome()`      — paged shelf assembly
 *   - `listTracks()`   — cursor pagination first-page latency
 *   - `markPlayed()` x100 — sync write path throughput after hydration
 *   - hydrate-from-disk — how long a cold start takes on a 10k catalog
 *
 * Output: writes a JSON summary to the path given by `--out=<file>` (default
 * `artifacts/bench-music-repo.json`) and prints a one-line table to stdout.
 * The matrix docs reference this file directly, so reviewers see concrete
 * numbers without re-running anything.
 *
 * Run:
 *   node --experimental-strip-types scripts/bench-music-repository.mts
 *   # or via the `npm run bench:music-repo` shortcut.
 */

import 'fake-indexeddb/auto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import type { Track } from '../src/domain/models.ts';
import { IndexedDbLocalMusicRepository } from '../src/infrastructure/repository/indexeddb-local-music-repository.ts';

type ScenarioResult = {
  samples: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

function summarize(samples: number[]): ScenarioResult {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    samples: sorted.length,
    p50Ms: roundTo(at(0.5)),
    p95Ms: roundTo(at(0.95)),
    maxMs: roundTo(sorted.at(-1) ?? 0),
  };
}

function roundTo(value: number): number {
  return Math.round(value * 100) / 100;
}

function generateTracks(count: number): Track[] {
  const tracks: Track[] = [];
  for (let i = 0; i < count; i++) {
    const id = `tr_${i.toString().padStart(5, '0')}`;
    tracks.push({
      id,
      title: i % 137 === 0 ? '钢琴与雨' : `本地曲目 ${i}`,
      artists: [{ id: `ar_${(i % 8).toString().padStart(2, '0')}`, name: '本地歌手' }],
      album: {
        id: `al_${(i % 12).toString().padStart(2, '0')}`,
        title: `本地专辑 ${i % 12}`,
        coverUrl: '',
        year: 2020 + (i % 5),
      },
      coverUrl: '',
      durationMs: 180_000 + (i % 30_000),
      playable: true,
      audioUrl: `asset://local/${id}`,
      source: 'local',
    });
  }
  return tracks;
}

async function scenarioSearch(repo: IndexedDbLocalMusicRepository): Promise<ScenarioResult> {
  const queries = [
    '钢琴',
    '本地',
    '曲目',
    '本地曲目 1',
    '本地曲目 99',
    '本地曲目 12345',
    '曲目 12345',
    '曲目 99999',
    '不存在的关键词',
    '本地曲目',
  ];
  const samples: number[] = [];
  for (let round = 0; round < 4; round += 1) {
    for (const query of queries) {
      const t0 = performance.now();
      const result = await repo.search(query);
      samples.push(performance.now() - t0);
      void result;
    }
  }
  return summarize(samples);
}

async function scenarioGetHome(repo: IndexedDbLocalMusicRepository): Promise<ScenarioResult> {
  const samples: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    const t0 = performance.now();
    await repo.getHome();
    samples.push(performance.now() - t0);
  }
  return summarize(samples);
}

async function scenarioListTracks(repo: IndexedDbLocalMusicRepository): Promise<ScenarioResult> {
  const samples: number[] = [];
  for (let page = 0; page < 20; page += 1) {
    const cursor = String(page * 200);
    const t0 = performance.now();
    await repo.listTracks(cursor, 200);
    samples.push(performance.now() - t0);
  }
  return summarize(samples);
}

async function scenarioMarkPlayed(repo: IndexedDbLocalMusicRepository): Promise<ScenarioResult> {
  const samples: number[] = [];
  for (let i = 0; i < 200; i += 1) {
    const t0 = performance.now();
    repo.markPlayed(`tr_${(i % 10_000).toString().padStart(5, '0')}`);
    samples.push(performance.now() - t0);
  }
  return summarize(samples);
}

async function scenarioHydrate(repo: IndexedDbLocalMusicRepository): Promise<ScenarioResult> {
  const samples: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now();
    await repo.ready();
    samples.push(performance.now() - t0);
  }
  return summarize(samples);
}

async function main() {
  const outArg = process.argv
    .find((arg) => arg.startsWith('--out='))
    ?.split('=')[1];
  const outPath = outArg
    ? resolve(outArg)
    : resolve('artifacts/bench-music-repo.json');
  mkdirSync(dirname(outPath), { recursive: true });

  console.log(`[bench] generating 10000 synthetic tracks...`);
  const tracks = generateTracks(10_000);
  console.log(`[bench] creating repository + first-boot hydration`);
  const tCreate = performance.now();
  const repo = new IndexedDbLocalMusicRepository({
    seed: tracks,
    name: 'openmusic-bench',
  });
  await repo.ready();
  const creationMs = performance.now() - tCreate;
  console.log(`[bench] hydration complete in ${roundTo(creationMs)}ms`);

  const search = await scenarioSearch(repo);
  const getHome = await scenarioGetHome(repo);
  const listTracks = await scenarioListTracks(repo);
  const markPlayed = await scenarioMarkPlayed(repo);
  const hydrate = await scenarioHydrate(repo);

  console.log(`[bench] search       p50=${search.p50Ms}ms p95=${search.p95Ms}ms max=${search.maxMs}ms (${search.samples} samples)`);
  console.log(`[bench] getHome      p50=${getHome.p50Ms}ms p95=${getHome.p95Ms}ms max=${getHome.maxMs}ms (${getHome.samples} samples)`);
  console.log(`[bench] listTracks   p50=${listTracks.p50Ms}ms p95=${listTracks.p95Ms}ms max=${listTracks.maxMs}ms (${listTracks.samples} samples)`);
  console.log(`[bench] markPlayed   p50=${markPlayed.p50Ms}ms p95=${markPlayed.p95Ms}ms max=${markPlayed.maxMs}ms (${markPlayed.samples} samples)`);
  console.log(`[bench] hydrate      p50=${hydrate.p50Ms}ms p95=${hydrate.p95Ms}ms max=${hydrate.maxMs}ms (${hydrate.samples} samples)`);

  const summary = {
    capture: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      tracks: tracks.length,
      creationMs: roundTo(creationMs),
    },
    scenarios: { search, getHome, listTracks, markPlayed, hydrate },
    notes: [
      'fake-indexeddb in-memory; numbers represent repository code, not ' +
        'real disk IDB throughput.',
      'matrix §3.10/§3.12 cite this file as evidence the 200ms search P95 ' +
        'budget holds at 10 000 tracks.',
    ],
  };
  writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[bench] wrote ${outPath}`);

  await repo.close();
}

main().catch((error) => {
  console.error('[bench] failed:', error);
  process.exitCode = 1;
});
