/**
 * Versioned migrator (spec §18): "必须有 schema_version 和逐版本 migration；
 * 升级失败保留原库并提供恢复路径".
 *
 * Driver contract is intentionally tiny so the same migrator runs against the
 * Android SQLite JNI bridge, the Windows SQLite wrapper, and the in-memory
 * fake used in tests.
 */

import { CancellationError } from '../../domain/errors.js';
import { MIGRATIONS, SCHEMA_VERSION } from './schema.js';

export interface SqlStatement {
  sql: string;
  params?: readonly unknown[];
}

export interface SqlResult {
  rows: readonly Record<string, unknown>[];
  rowsAffected: number;
}

export interface SqlDriver {
  execute(stmt: SqlStatement): Promise<SqlResult>;
  query(stmt: SqlStatement): Promise<SqlResult>;
  transaction<T>(body: () => Promise<T>): Promise<T>;
}

export interface MigrationOutcome {
  from: number;
  to: number;
  applied: number[];
}

export class MigrationError extends Error {
  readonly from: number;
  readonly failingVersion: number;

  constructor(from: number, failingVersion: number, cause: unknown) {
    super(`migration ${from} -> ${failingVersion} failed: ${String(cause)}`);
    this.name = 'MigrationError';
    this.from = from;
    this.failingVersion = failingVersion;
  }
}

/** Reads `schema_version`; returns 0 for a brand new file. */
export async function readSchemaVersion(driver: SqlDriver): Promise<number> {
  const exists = await driver.query({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'`,
  });
  if (exists.rows.length === 0) return 0;

  const rows = await driver.query({
    sql: `SELECT MAX(version) AS version FROM schema_version`,
  });
  const raw = rows.rows[0]?.['version'];
  return typeof raw === 'number' ? raw : 0;
}

/**
 * Applies every migration newer than the current version, in one transaction.
 *
 * Rollback semantics: DDL in SQLite is transactional, so a failure mid-way
 * leaves the database at its *previous* version rather than half-migrated.
 * The caller is expected to surface `MigrationError` and keep the pre-upgrade
 * backup made before calling this.
 */
export async function migrate(
  driver: SqlDriver,
  opts?: { target?: number; signal?: AbortSignal },
): Promise<MigrationOutcome> {
  const target = opts?.target ?? SCHEMA_VERSION;
  const from = await readSchemaVersion(driver);

  if (from > SCHEMA_VERSION) {
    // Downgrade is not supported: a newer build wrote this file.
    throw new MigrationError(from, from, new Error('database is newer than this build'));
  }

  const pending = MIGRATIONS.filter((m) => m.version > from && m.version <= target);
  if (pending.length === 0) return { from, to: from, applied: [] };

  const now = Date.now();
  await driver.transaction(async () => {
    for (const migration of pending) {
      opts?.signal?.throwIfAborted?.();
      try {
        for (const sql of migration.statements) {
          await driver.execute({ sql });
        }
        await driver.execute({
          sql: `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)`,
          params: [migration.version, now],
        });
      } catch (cause) {
        if (cause instanceof CancellationError) throw cause;
        throw new MigrationError(from, migration.version, cause);
      }
    }
  });

  return { from, to: target, applied: pending.map((m) => m.version) };
}