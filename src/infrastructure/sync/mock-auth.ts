/**
 * Stage 10 mock auth — satisfies `AuthPort` and `EntitlementsPort` without
 * a real server. Demo build + tests use this so the rest of the app can
 * wire auth-aware behaviour (Pro gating, sync opt-in) before the real
 * backend lands.
 *
 * Local-first rule (execution handbook §13 stage-10 item 7): every code
 * path that consumes `isPro()` must continue to work when the answer is
 * `false`. There is no `isProLocked` API; the contract itself encodes the
 * "local playback + organization + export never need Pro" rule by having
 * a single boolean instead of a capability set.
 *
 * Two thin classes share a backing `MockAuthState` so both ports stay in
 * sync without resorting to a single class with a clashing `onChange`
 * signature.
 */

import type {
  AuthPort,
  AuthState,
  EntitlementsPort,
} from '../../domain/sync-ports.js';

export interface MockAuthStateOptions {
  initial?: AuthState;
  signedOutTier?: string;
}

class MockAuthState {
  state: AuthState;
  readonly signedOutTier: string;
  readonly authListeners = new Set<(state: AuthState) => void>();
  readonly tierListeners = new Set<(tier: string) => void>();

  constructor(options: MockAuthStateOptions = {}) {
    this.state = options.initial ?? { kind: 'signed-out' };
    this.signedOutTier = options.signedOutTier ?? 'free';
  }

  publish(): void {
    for (const listener of [...this.authListeners]) listener(this.state);
  }

  publishTier(tier: string): void {
    for (const listener of [...this.tierListeners]) listener(tier);
  }
}

export class MockAuth implements AuthPort {
  private readonly backing: MockAuthState;

  constructor(backing: MockAuthState) {
    this.backing = backing;
  }

  static create(options: MockAuthStateOptions = {}): {
    auth: MockAuth;
    entitlements: MockEntitlements;
    state: MockAuthState;
  } {
    const state = new MockAuthState(options);
    return {
      auth: new MockAuth(state),
      entitlements: new MockEntitlements(state),
      state,
    };
  }

  async current(): Promise<AuthState> {
    return this.backing.state;
  }

  async signIn(): Promise<AuthState> {
    this.backing.state = {
      kind: 'signed-in',
      userId: 'usr_mock_001',
      displayName: 'OpenMusic 用户',
      tokenExpiresAt: Date.now() + 60 * 60 * 1000,
    };
    this.backing.publish();
    this.backing.publishTier('pro');
    return this.backing.state;
  }

  async signOut(): Promise<void> {
    this.backing.state = { kind: 'signed-out' };
    this.backing.publish();
    this.backing.publishTier(this.backing.signedOutTier);
  }

  async refresh(): Promise<AuthState> {
    return this.backing.state;
  }

  onChange(listener: (state: AuthState) => void): () => void {
    this.backing.authListeners.add(listener);
    return () => {
      this.backing.authListeners.delete(listener);
    };
  }
}

export class MockEntitlements implements EntitlementsPort {
  constructor(private readonly backing: MockAuthState) {}

  async isPro(): Promise<boolean> {
    return this.backing.state.kind === 'signed-in';
  }

  async tier(): Promise<string> {
    return this.backing.state.kind === 'signed-in'
      ? 'pro'
      : this.backing.signedOutTier;
  }

  onChange(listener: (tier: string) => void): () => void {
    this.backing.tierListeners.add(listener);
    return () => {
      this.backing.tierListeners.delete(listener);
    };
  }
}
