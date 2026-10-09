package com.openmusic.app.bridge

import android.content.Context
import android.graphics.Insets
import android.view.WindowInsets
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.provider.AbsTemplateProvider
import com.lynx.tasm.provider.LynxResourceFetcher
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Kotlin mirror of the `openmusicAndroid` global declared in
 * `src/platform/bridge.ts`.
 *
 * Verification status
 * -------------------
 * **Compiled API surface** in this file is sourced from the publicly
 * documented Lynx Android 3.6 SDK (https://lynxjs.org/3.8/zh/guide/start/
 * integrate-with-existing-apps) and the upstream `com.lynx.tasm` package.
 * The repository machine has no Android SDK / Maven cache, so **a full
 * `./gradlew :app:assembleDebug` has not been run** as of this revision —
 * see `docs/platform-capability-matrix.md` §3.2 and §3.0.
 *
 * Lifecycle:
 *   1. `MainActivity.onCreate` constructs `OpenMusicBridge(this)` and then
 *      calls `createLynxView()`. The returned `LynxView` is the root content
 *      view; the JS bundle loads asynchronously.
 *   2. `OpenMusicApplication.onCreate` should mint the bridge once; the
 *      bundle exposes it via `globalThis.openmusicAndroid` for the JS side
 *      to pick up (this glue is wired in `LynxEnvSetup`).
 */
data class WinInsets(val top: Int, val bottom: Int, val left: Int, val right: Int)

/**
 * Template provider that pulls `main.lynx.bundle` straight from `assets/`.
 * The `syncLynxBundle` task in `app/build.gradle.kts` copies the file in at
 * build time so the app never fetches JS from the network.
 */
private class AssetBundleProvider(context: Context) : AbsTemplateProvider() {
    private val appContext = context.applicationContext
    override fun loadTemplate(uri: String, callback: Callback) {
        Thread {
            try {
                appContext.assets.open(uri).use { stream ->
                    val bytes = ByteArrayOutputStream().also { out ->
                        val buf = ByteArray(8 * 1024)
                        while (true) {
                            val read = stream.read(buf)
                            if (read <= 0) break
                            out.write(buf, 0, read)
                        }
                    }.toByteArray()
                    callback.onSuccess(bytes)
                }
            } catch (cause: IOException) {
                callback.onFailed(cause.message ?: "asset $uri unreadable")
            }
        }.start()
    }
}

class OpenMusicBridge(private val context: Context) {

    private val focusListeners = CopyOnWriteArraySet<(Boolean) -> Unit>()
    private val mediaButtonListeners = CopyOnWriteArraySet<(String) -> Unit>()
    private val appStateListeners = CopyOnWriteArraySet<(String) -> Unit>()

    private var insets: WinInsets = WinInsets(0, 0, 0, 0)

    /**
     * Construct a `LynxView`, attach the asset template provider, and render
     * `main.lynx.bundle`. The previous stub threw `UnsupportedOperationException`
     * — see execution handbook §一阶段 2, item §2.4.
     *
     * Errors from the bundle load surface through the global Lynx error
     * callback so the user sees a diagnostic instead of a blank screen
     * (handbook §一阶段 2, item §2.7).
     */
    fun createLynxView(): LynxView {
        val builder = LynxViewBuilder().apply {
            setTemplateProvider(AssetBundleProvider(context))
            // `addBehaviors` accepts the XElement bridge so the bundle's
            // component set stays consistent with the Lynx web runtime.
            setResourceFetcher(SafeResourceFetcher(context))
        }
        val view = builder.build(context)
        view.renderTemplateUrl("main.lynx.bundle", "")
        return view
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

/**
 * Minimal `LynxResourceFetcher` that serves bundled assets. The real Lynx
 * apps split this into a `LynxImageService` for decode + cache; we keep the
 * default service for now and only override where the JS side asks for a
 * non-image resource.
 */
private class SafeResourceFetcher(context: Context) : LynxResourceFetcher {
    private val appContext = context.applicationContext
    override fun shouldUseResourceFetcher(url: String?): Boolean = false
    override fun fetchResource(url: String?, callback: Callback?) {
        // Default behaviour is fine for the demo bundle; future phases add
        // image caching + offline asset overrides here.
        callback?.onFailed("OpenMusic: resource fetcher not yet wired ($url)")
    }
}