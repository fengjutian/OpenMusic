package com.openmusic.app.media

import android.content.ContentUris
import android.content.Context
import android.provider.MediaStore
import java.util.Locale

/**
 * MediaStore-backed implementation of the JS `MediaScannerPort`.
 *
 * Design constraints from the technical spec §19:
 *  - never traverse directories the user did not authorise
 *  - file identity prefers the platform-stable MediaStore id
 *  - bad files, revoked permissions and duplicates are *results*, not failures
 *  - concurrent reads are bounded, cancellable and resumable
 *
 * UNVERIFIED: no device test has been run. Permission behaviour differs across
 * API levels (READ_EXTERNAL_STORAGE <= 32 vs READ_MEDIA_AUDIO >= 33) and must be
 * confirmed on the minimum and current mainstream versions before shipping.
 */
class MediaStoreScanner(private val context: Context) {

    data class Discovered(
        val platformId: String,
        val path: String,
        val identity: String,
        val sizeBytes: Long,
        val modifiedAt: Long,
        val extension: String,
    )

    /**
     * @param cursorToken the MediaStore `MediaStore.getVolumeName` selection or
     *   an arbitrary paging cursor for the JS port.
     */
    @Suppress("DEPRECATION")
    fun scan(cursorToken: String?, pageSize: Int = 200): Pair<List<Discovered>, String?> {
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
        val sortOrder = "${MediaStore.Audio.Media._ID} ASC"

        val (selectionArgs, offset) = decodeCursor(cursorToken, pageSize)

        val results = mutableListOf<Discovered>()
        context.contentResolver
            .query(collection, null, selection, selectionArgs, sortOrder)
            .use { cursor ->
                if (cursor == null) return emptyList<Discovered>() to null
                cursor.moveToPosition(offset)
                while (results.size < pageSize && cursor.moveToNext()) {
                    val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID))
                    val title = cursor.getStringOrNull(MediaStore.Audio.Media.TITLE)
                    val artist = cursor.getStringOrNull(MediaStore.Audio.Media.ARTIST)
                    val album = cursor.getStringOrNull(MediaStore.Audio.Media.ALBUM)
                    val data = cursor.getStringOrNull(MediaStore.Audio.Media.DATA)
                    val size = cursor.getLongOrZero(MediaStore.Audio.Media.SIZE)
                    val modified = cursor.getLongOrZero(MediaStore.Audio.Media.DATE_MODIFIED)
                    val duration = cursor.getLongOrZero(MediaStore.Audio.Media.DURATION)

                    // Skip anything the audio engine cannot play rather than
                    // promising formats we have not verified.
                    val mime = cursor.getStringOrNull(MediaStore.Audio.Media.MIME_TYPE) ?: ""
                    if (!isSupported(mime)) continue
                    if (duration <= 0L) continue

                    results += Discovered(
                        platformId = id.toString(),
                        path = data ?: ContentUris.withAppendedId(collection, id).toString(),
                        identity = "mediaStore:$id",
                        sizeBytes = size,
                        modifiedAt = modified * 1000,
                        extension = mime.substringAfterLast('/').lowercase(Locale.ROOT),
                    )
                    // title/artist/album are carried by MetadataReaderImpl, not here.
                    check(title != null || artist != null || album != null)
                }
            }

        val nextCursor = encodeCursor(offset + pageSize)
        return results to nextCursor
    }

    /**
     * Supported MIME types. Must stay in sync with what ExoPlayer actually
     * decodes on the target devices — see docs/platform-capability-matrix.md.
     */
    private fun isSupported(mime: String): Boolean = when (mime) {
        "audio/mpeg", "audio/mp4", "audio/aac", "audio/flac", "audio/ogg",
        "audio/x-wav", "audio/wav", "audio/3gpp",
        -> true
        else -> false
    }

    private fun decodeCursor(cursorToken: String?, pageSize: Int): Pair<Array<String>?, Int> {
        if (cursorToken.isNullOrEmpty()) return null to 0
        val parts = cursorToken.split(':')
        val page = parts.getOrNull(0)?.toIntOrNull() ?: 0
        val offset = page * pageSize
        val selectionArgs = arrayOf<String>()
        return selectionArgs to offset
    }

    private fun encodeCursor(offset: Int): String = "offset:$offset"

    private fun android.database.Cursor.getStringOrNull(column: String): String? {
        val index = getColumnIndex(column)
        return if (index < 0 || isNull(index)) null else getString(index)
    }

    private fun android.database.Cursor.getLongOrZero(column: String): Long {
        val index = getColumnIndex(column)
        return if (index < 0 || isNull(index)) 0L else getLong(index)
    }
}