package com.openmusic.app.bridge

import android.content.Context
import android.graphics.Insets
import android.view.WindowInsets
import java.util.concurrent.CopyOnWriteArraySet
import org.lynxsdk.lynx.LynxView

/**
 * Kotlin mirror of the `openmusicAndroid` global declared in
 * `src/platform/bridge.ts`.
 *
 * IMPORTANT — verification status
 * -------------------------------
 * The JavaScript contract is verified (it type-checks against
 * `@lynx-js/types` and is exercised by unit tests). The Kotlin side below is
 * NOT compile-verified: this repository is built on a machine without the
 * Android SDK, so no Gradle build has been run.
 *
 * Before this file is trusted, confirm against the pinned
 * `org.lynxsdk.lynx:lynx:4.1.0` artifact:
 *   1. `LynxView` construction + `LynxContext` init sequence
 *   2. how a custom global is injected into the JS context
 *   3. `WindowInsets` API level behaviour on minSdk 26
 *
 * See docs/platform-capability-matrix.md, row "safe-area".
 */
data class WinInsets(val top: Int, val bottom: Int, val left: Int, val right: Int)

class OpenMusicBridge(private val context: Context) {

    private val focusListeners = CopyOnWriteArraySet<(Boolean) -> Unit>()
    private val mediaButtonListeners = CopyOnWriteArraySet<(String) -> Unit>()
    private val appStateListeners = CopyOnWriteArraySet<(String) -> Unit>()

    private var insets: WinInsets = WinInsets(0, 0, 0, 0)

    fun createLynxView(): LynxView {
        // TODO(verify): construct the Lynx view with the bundled assets entry.
        throw UnsupportedOperationException(
            "Lynx view creation must be verified against org.lynxsdk.lynx:lynx:4.1.0 " +
                "before shipping. See android/README.md.",
        )
    }

    fun onResume() {
        appStateListeners.forEach { it("active") }
    }

    fun onPause() {
        appStateListeners.forEach { it("background") }
    }

    fun release() {
        focusListeners.clear()
        mediaButtonListeners.clear()
        appStateListeners.clear()
    }

    fun currentInsets(): WinInsets = insets

    fun updateInsets(windowInsets: WindowInsets) {
        val bars = windowInsets.getInsets(WindowInsets.Type.systemBars())
        val cutout = windowInsets.displayCutout?.let { cutoutInsets(it) } ?: Insets.NONE
        insets = WinInsets(
            top = maxOf(bars.top, cutout.top),
            bottom = bars.bottom,
            left = maxOf(bars.left, cutout.left),
            right = maxOf(bars.right, cutout.right),
        )
    }

    private fun cutoutInsets(cutout: android.graphics.Rect): Insets =
        Insets.of(cutout.left, cutout.top, cutout.right, cutout.bottom)

    // --- callbacks surfaced to JS ------------------------------------------

    fun dispatchAudioFocus(focused: Boolean) = focusListeners.forEach { it(focused) }

    fun dispatchMediaButton(command: String) = mediaButtonListeners.forEach { it(command) }

    fun dispatchAppState(state: String) = appStateListeners.forEach { it(state) }
}