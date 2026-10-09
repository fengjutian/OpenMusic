/**
 * Stage 10 provider hardening tests. The helpers are pure functions; we
 * exercise them through a sample provider that mirrors the contract every
 * real provider will have to satisfy.
 */

import { describe, expect, it } from '@rstest/core';

import { AppError } from '../../../domain/errors.js';
import type { PageResult, Track } from '../../../domain/models.js';
import type { ContentProvider } from '../../../domain/ports.js';
import {
  DEFAULT_CIRCUIT_COOLDOWN_MS,
  DEFAULT_CIRCUIT_FAIL_THRESHOLD,
  ProviderCircuitBreaker,
  describeProviderSource,
  withProviderTimeout,
} from '../provider-hardening.js';

function fakeTrack(id: string): Track {
  return {
    id,
    title: `track ${id}`,
    artists: [{ id: 'ar_1', name: 'faker' }],
    album: { id: 'al_1', title: 'al', coverUrl: '', year: 2024 },
    coverUrl: '',
    durationMs: 100_000,
    playable: true,
    audioUrl: `asset://local/${id}`,
    source: 'local',
  };
}

describe('withProviderTimeout', () => {
  it('rejects with ProviderTimeoutError when the work exceeds the budget', async () => {
    const work = withProviderTimeout(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 100)),
      20,
    );
    await expect(work).rejects.toThrow(/exceeded 20ms/);
  });

  it('resolves with the work value when it finishes within the budget', async () => {
    const value = await withProviderTimeout(
      () => Promise.resolve('on-time'),
      50,
    );
    expect(value).toBe('on-time');
  });
});

describe('ProviderCircuitBreaker', () => {
  it('stays closed below the failure threshold', () => {
    const breaker = new ProviderCircuitBreaker(3, 1_000);
    expect(breaker.isOpen(0)).toBe(false);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    expect(breaker.isOpen(0)).toBe(false);
  });

  it('opens after the threshold is reached and stays open through the cooldown', () => {
    const breaker = new ProviderCircuitBreaker(3, 1_000);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    expect(breaker.isOpen(0)).toBe(true);
    expect(breaker.isOpen(500)).toBe(true);
    expect(breaker.isOpen(1_500)).toBe(false);
  });

  it('recordSuccess resets the counter', () => {
    const breaker = new ProviderCircuitBreaker(2, 1_000);
    breaker.recordFailure(0);
    breaker.recordSuccess();
    breaker.recordFailure(0);
    expect(breaker.isOpen(0)).toBe(false);
  });
});

describe('ContentProvider contract (stage 10 source labelling + revoke)', () => {
  it('exposes providerName so the UI can label the data source', () => {
    const provider: ContentProvider = {
      id: 'lyrics-cn',
      capabilities: () => ({
        search: false,
        lyrics: true,
        requiresAuth: false,
        providerName: '公开歌词源',
      }),
      search: async (): Promise<PageResult<Track>> => ({ items: [], hasMore: false }),
      resolve: async () => ({ url: '' }),
      revoke: async () => undefined,
    };
    expect(provider.capabilities().providerName).toBe('公开歌词源');
    expect(describeProviderSource(provider.capabilities().providerName)).toBe('公开歌词源');
  });

  it('rejects search when the provider has been revoked (requiresAuth flips back)', async () => {
    let requiresAuth = true;
    const provider: ContentProvider = {
      id: 'lyrics-cn',
      capabilities: () => ({
        search: false,
        lyrics: true,
        requiresAuth,
        providerName: '受控歌词源',
      }),
      search: async (): Promise<PageResult<Track>> => {
        if (requiresAuth) {
          throw new AppError('unauthorized', '请先登录');
        }
        return { items: [fakeTrack('tr_test')], hasMore: false };
      },
      resolve: async () => ({ url: '' }),
      revoke: async () => {
        requiresAuth = true;
      },
    };
    // First call before any sign-in → unauthorized.
    await expect(provider.search('q')).rejects.toThrow(/请先登录/);
    // After sign-in, the host flips the flag.
    requiresAuth = false;
    const result = await provider.search('q');
    expect(result.items[0]?.id).toBe('tr_test');
    // Sign-out → revoke() restores the gate.
    await provider.revoke();
    await expect(provider.search('q')).rejects.toThrow(/请先登录/);
  });

  it('exposes the stage-10 constants for callers that want to override them', () => {
    expect(DEFAULT_CIRCUIT_FAIL_THRESHOLD).toBeGreaterThan(0);
    expect(DEFAULT_CIRCUIT_COOLDOWN_MS).toBeGreaterThan(0);
  });
});
