/**
 * In-memory `SqlDriver` used by tests and by the mock bootstrap. It is NOT a
 * SQL engine — it recognises the handful of statements the migrator emits so
 * that migration sequencing, rollback and version bookkeeping can be verified
 * without a real SQLite driver.
 *
 * Production note: spec §18 forbids shipping an in-memory database. Nothing
 * here is wired into a release build; see `bootstrap.ts`.
 */

import type { SqlDriver, SqlResult, SqlStatement } from './migrator.js';

interface TableState {
  columns: readonly string[];
  rows: Map<string, Record<string, unknown>>;
}

const MIGRATION_TABLE_COLUMNS = ['version', 'applied_at'] as const;

export class MemorySqlDriver implements SqlDriver {
  private readonly tables = new Map<string, TableState>();
  /** Statements recorded in order; handy for asserting migration behaviour. */
  readonly executed: SqlStatement[] = [];
  /** When set, the next `execute` throws — used to prove rollback works. */
  failOnTable: string | null = null;

  async execute(stmt: SqlStatement): Promise<SqlResult> {
    this.executed.push(stmt);
    const create = /^CREATE TABLE IF NOT EXISTS (\w+)/.exec(stmt.sql);
    if (create) {
      const table = create[1]!;
      if (this.failOnTable === table) throw new Error(`boom on ${table}`);
      this.tables.set(table, { columns: MIGRATION_TABLE_COLUMNS, rows: new Map() });
      return { rows: [], rowsAffected: 0 };
    }

    const insert =
      /^INSERT OR REPLACE INTO schema_version \(version, applied_at\) VALUES \(\?, \?\)$/.exec(
        stmt.sql,
      );
    if (insert) {
      const table = this.tables.get('schema_version');
      if (!table) throw new Error('schema_version missing');
      const [version, appliedAt] = stmt.params ?? [];
      table.rows.set(String(version), { version, applied_at: appliedAt });
      return { rows: [], rowsAffected: 1 };
    }

    return { rows: [], rowsAffected: 0 };
  }

  async query(stmt: SqlStatement): Promise<SqlResult> {
    if (/FROM sqlite_master/.test(stmt.sql)) {
      // `schema_version` is created by the migration itself, so it only shows
      // up once it has been recorded as applied.
      const rows = [...this.tables.entries()]
        .filter(([name, state]) => name !== 'schema_version' || state.rows.size > 0)
        .map(([name]) => ({ name }));
      return { rows, rowsAffected: 0 };
    }
    if (/MAX\(version\)/.test(stmt.sql)) {
      const table = this.tables.get('schema_version');
      const versions = [...(table?.rows.values() ?? [])].map((r) => r['version']);
      return { rows: [{ version: versions.length ? Math.max(...(versions as number[])) : null }], rowsAffected: 0 };
    }
    return { rows: [], rowsAffected: 0 };
  }

  async transaction<T>(body: () => Promise<T>): Promise<T> {
    const snapshot = new Map<string, Map<string, Record<string, unknown>>>();
    for (const [name, state] of this.tables) snapshot.set(name, new Map(state.rows));
    const executedBefore = this.executed.length;
    try {
      return await body();
    } catch (error) {
      // DDL rollback: discard everything created inside the transaction.
      this.tables.clear();
      for (const [name, rows] of snapshot) {
        this.tables.set(name, { columns: MIGRATION_TABLE_COLUMNS, rows });
      }
      this.executed.length = executedBefore;
      throw error;
    }
  }

  /** Test helper. */
  get currentVersionRows(): Record<string, unknown>[] {
    return [...(this.tables.get('schema_version')?.rows.values() ?? [])];
  }
}