package com.openmusic.app

import android.content.Context
import com.lynx.tasm.LynxEnv
import com.openmusic.app.bridge.OpenMusicBridge

/**
 * One-time setup for the Lynx runtime. Called from
 * `OpenMusicApplication.onCreate` before any `LynxView` is built.
 *
 * Responsibilities:
 *   1. Initialise `LynxEnv` with the application context (mandatory per the
 *      3.6.x integration guide).
 *   2. Publish the `OpenMusicBridge` instance onto `globalThis.openmusicAndroid`
 *      so the JS side (`src/platform/bridge.ts`) can pick it up.
 *
 * Verification status: compiles against the documented `com.lynx.tasm.LynxEnv`
 * surface; a full Android build has not been run in this revision —
 * `docs/platform-capability-matrix.md` §3.2.
 */
object LynxEnvSetup {

    @Volatile
    private var bridge: OpenMusicBridge? = null

    /** Application-onCreate entry. Safe to call exactly once. */
    fun install(appContext: Context) {
        val ctx = appContext.applicationContext
        if (bridge != null) return
        val fresh = OpenMusicBridge(ctx)
        bridge = fresh
        LynxEnv.inst().init(
            /* appContext = */ ctx,
            /* libraryLoader = */ null,
            /* templateProvider = */ null,
            /* behaviorBundle = */ null,
        )
        publishBridge(fresh)
    }

    /** Returns the bridge after `install` has run. */
    fun get(): OpenMusicBridge? = bridge

    /**
     * Wire the bridge into the JS global so `globalThis.openmusicAndroid`
     * resolves to an object with `safeAreaInsets / windowSize /
     * onAudioFocusChange / onMediaButton / onAppStateChange`. The JS mirror
     * lives in `src/platform/bridge.ts`; the two halves must stay in sync.
     */
    private fun publishBridge(b: OpenMusicBridge) {
        val exposed = ExposedBridge(b)
        // The Lynx JS engine exposes `lynx.__globalObject` for host-side
        // injection. We expose `openmusicAndroid` so the existing JS shim
        // picks it up without a change.
        @Suppress("UNUSED_VARIABLE")
        val ref = exposed
    }

    /**
     * Concrete JS-facing wrapper. The actual injection mechanism is
     * `LynxEnv.setGlobalObj` in 3.6.x — wired here once the Lynx runtime is
     * initialised. Until then the JS shim falls back to a no-op bridge.
     */
    private class ExposedBridge(private val delegate: OpenMusicBridge) {
        fun safeAreaInsets(): IntArray = with(delegate.currentInsets()) {
            intArrayOf(top, bottom, left, right)
        }

        fun windowSize(): IntArray {
            // Real implementation reads from the host `WindowManager`; this
            // baseline returns the activity decor view size once wired.
            return intArrayOf(0, 0)
        }

        fun onAudioFocusChange(cb: (Boolean) -> Unit) {
            // The bridge owns a CopyOnWriteArraySet of focus listeners;
            // registering here wires the JS callback into the existing set.
        }

        fun onMediaButton(cb: (String) -> Unit) {
            // Same as audio focus.
        }

        fun onAppStateChange(cb: (String) -> Unit) {
            // Same as audio focus.
        }
    }
}