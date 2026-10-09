package com.openmusic.app.media

import android.media.MediaMetadataRetriever
import java.io.File

/**
 * Implementation of the JS `MetadataReaderPort`.
 *
 * Degradation rules from the product spec §16.3:
 *   file name -> 未知歌手 -> 未知专辑
 *
 * UNVERIFIED: `MediaMetadataRetriever` behaviour with malformed tags varies by
 * OEM. Each field is read defensively and any failure degrades to `null` rather
 * than aborting the scan.
 */
class MetadataReaderImpl {

    data class Metadata(
        val title: String?,
        val artists: List<String>,
        val album: String?,
        val albumArtist: String?,
        val year: Int?,
        val trackNo: Int?,
        val discNo: Int?,
        val genre: String?,
        val durationMs: Long?,
        val lyrics: String?,
    )

    fun read(path: String): Metadata {
        val fallbackTitle = File(path).nameWithoutExtension
        val retriever = MediaMetadataRetriever()

        return try {
            retriever.setDataSource(path)

            Metadata(
                title = retriever.text(MediaMetadataRetriever.METADATA_KEY_TITLE) ?: fallbackTitle,
                artists = retriever.text(MediaMetadataRetriever.METADATA_KEY_ARTIST)
                    ?.let { listOf(it) }
                    ?: emptyList(),
                album = retriever.text(MediaMetadataRetriever.METADATA_KEY_ALBUM),
                albumArtist = retriever.text(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST),
                year = retriever.text(MediaMetadataRetriever.METADATA_KEY_YEAR)?.toIntOrNull(),
                trackNo = retriever.text(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)?.toIntOrNull(),
                discNo = retriever.text(MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER)?.toIntOrNull(),
                genre = retriever.text(MediaMetadataRetriever.METADATA_KEY_GENRE),
                durationMs = retriever.text(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull(),
                lyrics = null, // Lyrics require a dedicated parser; see README.
            )
        } catch (_: RuntimeException) {
            // A corrupt or unsupported file yields a degraded row, never a crash.
            Metadata(
                title = fallbackTitle,
                artists = emptyList(),
                album = null,
                albumArtist = null,
                year = null,
                trackNo = null,
                discNo = null,
                genre = null,
                durationMs = null,
                lyrics = null,
            )
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun MediaMetadataRetriever.text(key: Int): String? =
        runCatching { extractMetadata(key) }.getOrNull()?.takeIf { it.isNotBlank() }
}