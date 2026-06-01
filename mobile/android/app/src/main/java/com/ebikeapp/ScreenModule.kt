package com.ebikeapp

import android.os.Build
import android.util.Rational
import android.app.PictureInPictureParams
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScreenModule"

    @ReactMethod
    fun activateKeepAwake() {
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    @ReactMethod
    fun deactivateKeepAwake() {
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // ratioWidth / ratioHeight define the PiP window aspect ratio.
    // Default 16:9 suits a landscape telemetry strip; caller can pass 2:1 for a
    // narrower portrait strip (e.g. speed + battery only).
    @ReactMethod
    fun enterPip(ratioWidth: Int, ratioHeight: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(ratioWidth, ratioHeight))
                .build()
            activity.enterPictureInPictureMode(params)
        }
    }

    @ReactMethod
    fun exitPip() {
        // PiP exits when the user taps the expand or close buttons.
        // Stub retained for future programmatic exit or cleanup hooks.
    }
}
