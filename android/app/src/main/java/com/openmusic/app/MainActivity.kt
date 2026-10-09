package com.openmusic.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.openmusic.app.bridge.OpenMusicBridge
import com.openmusic.app.bridge.WinInsets

/**
 * Hosts the Lynx view and wires the platform adapter.
 *
 * The JS side reaches native capabilities through `globalThis.openmusicAndroid`
 * (declared in `src/platform/bridge.ts`), never through direct module imports.
 */
class MainActivity : ComponentActivity() {

    private lateinit var bridge: OpenMusicBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        bridge = OpenMusicBridge(this)

        // The Lynx view is created by the Lynx runtime; the exact builder API
        // must be checked against the pinned org.lynxsdk.lynx:lynx artifact.
        // See android/README.md — this file is NOT compile-verified yet.
        setContentView(bridge.createLynxView())
    }

    override fun onStart() {
        super.onStart()
        bridge.onResume()
    }

    override fun onStop() {
        bridge.onPause()
        super.onStop()
    }

    override fun onDestroy() {
        bridge.release()
        super.onDestroy()
    }

    fun currentInsets(): WinInsets = bridge.currentInsets()

    fun applySystemBarColors() {
        WindowInsetsCompat
            .toWindowInsetsCompat(window.decorView.rootWindowInsets)
            .let { /* insets are surfaced through the bridge, not here */ }
    }
}