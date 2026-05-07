package com.ebikeapp

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BleForegroundServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BleForegroundService"

    @ReactMethod
    fun start() {
        val intent = Intent(reactContext, BleForegroundService::class.java).apply {
            action = BleForegroundService.ACTION_START
        }
        reactContext.startForegroundService(intent)
    }

    @ReactMethod
    fun stop() {
        val intent = Intent(reactContext, BleForegroundService::class.java).apply {
            action = BleForegroundService.ACTION_STOP
        }
        reactContext.startService(intent)
    }
}
