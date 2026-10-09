package com.openmusic.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.openmusic.app.bridge.OpenMusicBridge
import com.openmusic.app.bridge.WinInsets

/**
 * Hosts the Lynx view and wires the platform adapter.
 *
 * The JS side reaches native capabilities through `globalThis.openmusicAndroid`
 * (declared in `src/platform/bridge.ts`), never through direct module imports.
 * `LynxEnvSetup.install` ran in `OpenMusicApplication.onCreate`, so the bridge
 * is already available when this activity starts.
 */
class MainActivity : ComponentActivity() {

    private lateinit var bridge: OpenMusicBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        bridge = LynxEnvSetup.get()
            ?: throw IllegalStateException(
                "LynxEnvSetup not initialised — check OpenMusicApplication registration in AndroidManifest.xml.",
            )

        val view = bridge.createLynxView()
        setContentView(view)

        ViewCompat.setOnApplyWindowInsetsListener(view) { _, insetsCompat ->
            val platformInsets = insetsCompat.toWindowInsets()
            if (platformInsets != null) {
                bridge.updateInsets(platformInsets)
            }
            insetsCompat
        }
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
}