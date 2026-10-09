package com.openmusic.app

import android.app.Application

/**
 * Application entry. Initialises the Lynx runtime exactly once so that the
 * very first `LynxView` construction finds `LynxEnv.inst()` already
 * configured. See `LynxEnvSetup.install`.
 */
class OpenMusicApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        LynxEnvSetup.install(this)
    }
}