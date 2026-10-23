package `in`.medisaathi.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Voice input with Android's SpeechRecognizer, because the WebView's own speech recognition does not work.
 * Uses the on-device recognizer when the phone has one (offline, audio never leaves the phone) and falls back to the
 * system recognizer, still asking it to prefer offline. The JS side is src/platform/listen.ts.
 */
@CapacitorPlugin(
    name = "Speech",
    permissions = [Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO])],
)
class SpeechPlugin : Plugin() {
    private var recognizer: SpeechRecognizer? = null
    private var call: PluginCall? = null

    @PluginMethod
    fun start(call: PluginCall) {
        if (call.getString("lang") == null) return call.reject("bad-lang")
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            return requestPermissionForAlias("microphone", call, "micAnswered")
        }
        activity.runOnUiThread { begin(call, onDevice = true) }
    }

    @PermissionCallback
    private fun micAnswered(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) activity.runOnUiThread { begin(call, onDevice = true) }
        else call.reject("denied", "not-allowed")
    }

    /** Stops listening; the words heard so far still arrive as the result. */
    @PluginMethod
    fun stop(call: PluginCall) {
        activity.runOnUiThread { recognizer?.stopListening() }
        call.resolve()
    }

    override fun handleOnDestroy() {
        activity.runOnUiThread { finish() }
    }

    private fun begin(call: PluginCall, onDevice: Boolean) {
        this.call?.reject("replaced", "aborted")
        finish()
        val ctx = context
        val local = onDevice && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)
        val r = when {
            local -> SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx)
            SpeechRecognizer.isRecognitionAvailable(ctx) -> SpeechRecognizer.createSpeechRecognizer(ctx)
            else -> return call.reject("unavailable", "unavailable")
        }
        recognizer = r
        this.call = call
        r.setRecognitionListener(object : RecognitionListener {
            override fun onPartialResults(results: Bundle) {
                best(results)?.let { notifyListeners("partial", JSObject().put("text", it)) }
            }

            override fun onResults(results: Bundle) {
                val c = this@SpeechPlugin.call ?: return
                finish()
                c.resolve(JSObject().put("text", best(results) ?: ""))
            }

            override fun onError(error: Int) {
                val c = this@SpeechPlugin.call ?: return
                // The on-device pack may not cover this language yet: try the system recognizer once.
                if (local && (error == ERROR_LANGUAGE_NOT_SUPPORTED || error == ERROR_LANGUAGE_UNAVAILABLE)) {
                    this@SpeechPlugin.call = null
                    return begin(c, onDevice = false)
                }
                finish()
                c.reject(reason(error), reason(error))
            }

            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        r.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang"))
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                // The fallback may use the network when there is one; insisting on offline makes it fail without a language pack.
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, onDevice)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1),
        )
    }

    private fun finish() {
        recognizer?.destroy()
        recognizer = null
        call = null
    }

    private fun best(results: Bundle) =
        results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }

    private fun reason(error: Int) = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER,
        ERROR_SERVER_DISCONNECTED, ERROR_LANGUAGE_NOT_SUPPORTED, ERROR_LANGUAGE_UNAVAILABLE -> "network"
        else -> "unavailable"
    }

    private companion object {
        // Added in API 31; written out so the app still compiles against older levels.
        const val ERROR_SERVER_DISCONNECTED = 11
        const val ERROR_LANGUAGE_NOT_SUPPORTED = 12
        const val ERROR_LANGUAGE_UNAVAILABLE = 13
    }
}
