import { describe, expect, it } from '@rstest/core';

import { MemorySqlDriver } from '../memory-driver.js';
import { migrate, MigrationError, readSchemaVersion } from '../migrator.js';
import { MIGRATIONS, SCHEMA_VERSION } from '../schema.js';

describe('schema', () => {
  it('declares every table named in the technical spec §18', () => {
    const sql = MIGRATIONS.flatMap((m) => m.statements).join('\n');
    for (const table of [
      'tracks',
      'artists',
      'albums',
      'track_artists',
      'playlists',
      'playlist_items',
      'favorites',
      'play_history',
      'lyrics',
      'scan_roots',
      'scan_runs',
      'settings',
      'sync_changes',
      'schema_version',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('is append-only: version 1 exists and SCHEMA_VERSION matches it', () => {
    expect(MIGRATIONS[0]!.version).toBe(1);
    expect(SCHEMA_VERSION).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version);
  });

  it('never has duplicate versions', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('migrate', () => {
  it('applies every pending migration and records the version', async () => {
    const driver = new MemorySqlDriver();
    const outcome = await migrate(driver);

    expect(outcome.from).toBe(0);
    expect(outcome.to).toBe(SCHEMA_VERSION);
    expect(outcome.applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await readSchemaVersion(driver)).toBe(SCHEMA_VERSION);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const driver = new MemorySqlDriver();
    await migrate(driver);
    const second = await migrate(driver);

    expect(second.applied).toEqual([]);
    expect(second.from).toBe(SCHEMA_VERSION);
  });

  it('rolls back to the previous version when a statement fails', async () => {
    const driver = new MemorySqlDriver();
    driver.failOnTable = 'tracks';

    await expect(migrate(driver)).rejects.toBeInstanceOf(MigrationError);

    // Nothing half-applied survived the transaction.
    expect(await readSchemaVersion(driver)).toBe(0);
  });

  it('reports which version failed', async () => {
    const driver = new MemorySqlDriver();
    driver.failOnTable = 'artists';

    try {
      await migrate(driver);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError);
      expect((error as MigrationError).failingVersion).toBe(1);
      expect((error as MigrationError).from).toBe(0);
    }
  });

  it('refuses to open a database written by a newer build', async () => {
    const driver = new MemorySqlDriver();
    await driver.execute({ sql: `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER, applied_at INTEGER)` });
    await driver.execute({
      sql: `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)`,
      params: [SCHEMA_VERSION + 5, Date.now()],
    });

    await expect(migrate(driver)).rejects.toBeInstanceOf(MigrationError);
  });

  it('stops at an explicit target version', async () => {
    const driver = new MemorySqlDriver();
    const outcome = await migrate(driver, { target: 1 });
    expect(outcome.applied).toEqual([1]);
  });
});