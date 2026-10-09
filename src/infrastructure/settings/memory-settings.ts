/**
 * In-memory settings / secure storage. Used by the mock build and by tests.
 *
 * Release builds must swap in the SQLite `settings` table (`SettingsPort`) and
 * the platform keystore (`SecureStoragePort`). See
 * `infrastructure/settings/create-settings.ts`.
 */

import type { SecureStoragePort, SettingsPort } from '../../domain/ports.js';

export class MemorySettings implements SettingsPort {
  private readonly store = new Map<string, string>();

  async get<T>(key: string, fallback: T): Promise<T> {
    const raw = this.store.get(key);
    if (raw === undefined) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }

  /** Test helper: seed values without going through the async surface. */
  seed(key: string, value: unknown): void {
    this.store.set(key, JSON.stringify(value));
  }
}

export class MemorySecureStorage implements SecureStoragePort {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}