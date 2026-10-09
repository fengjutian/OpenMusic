package com.openmusic.app.storage

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File

/**
 * `SqlDriver` for the TypeScript migrator in `src/infrastructure/database`.
 *
 * The JS migrator owns the DDL and the version bookkeeping; this class only
 * provides a transaction-scoped handle. That keeps a single definition of the
 * schema (technical spec §18) instead of duplicating it in Kotlin.
 *
 * UNVERIFIED: not compiled on this machine. The `runAsyncJs`-style bridge used
 * to expose this to JS must be confirmed against the pinned Lynx runtime.
 */
class SqliteDriver(context: Context, databaseName: String = "openmusic.db") {
    private val helper = object : SQLiteOpenHelper(
        context.applicationContext,
        databaseName,
        null,
        0, // The JS migrator owns versions; the helper must not try to manage them.
    ) {
        override fun onCreate(db: SQLiteDatabase) = Unit
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    }

    val databaseFile: File get() = helper.writableDatabase.path.let { File(it) }

    fun <T> transaction(body: (SQLiteDatabase) -> T): T {
        val db = helper.writableDatabase
        db.beginTransaction()
        return try {
            val result = body(db)
            db.setTransactionSuccessful()
            result
        } finally {
            db.endTransaction()
        }
    }

    fun execute(sql: String, params: List<Any?> = emptyList()) = transaction { db ->
        if (params.isEmpty()) db.execSQL(sql) else db.execSQL(sql, params.toTypedArray())
    }

    fun query(sql: String, params: List<Any?> = emptyList()): List<Map<String, Any?>> =
        transaction { db ->
            db.rawQuery(sql, params.map { it?.toString() }.toTypedArray()).use { cursor ->
                buildList {
                    while (cursor.moveToNext()) {
                        add(
                            buildMap {
                                for (i in 0 until cursor.columnCount) {
                                    put(cursor.getColumnName(i), cursor.getObject(i))
                                }
                            },
                        )
                    }
                }
            }
        }

    /**
     * Backup before a schema upgrade (technical spec §25: "数据库迁移前创建可恢复
     * 备份"). Call this before handing control to the JS migrator.
     */
    fun backup(target: File): File {
        helper.writableDatabase.use { it.rawQuery("PRAGMA wal_checkpoint(FULL)", null).close() }
        helper.readableDatabase.rawQuery("VACUUM INTO '${target.absolutePath}'", null).close()
        return target
    }

    fun close() = helper.close()
}