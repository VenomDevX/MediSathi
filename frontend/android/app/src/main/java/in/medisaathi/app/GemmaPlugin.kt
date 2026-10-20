package `in`.medisaathi.app

import android.content.Intent
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.SamplerConfig
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Gemma on the phone with Google's LiteRT-LM engine (GPU, CPU fallback). The JS side (src/assistant/native.ts) owns
 * the catalogue and the prompt; this class only stores model files and runs one answer at a time.
 */
@CapacitorPlugin(name = "Gemma")
class GemmaPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val engineLock = Mutex()
    private var engine: Engine? = null
    private var engineFile: String? = null
    private var onGpu = false
    private var gpuWorks = true // ponytail: per app run; persist it if the failed GPU attempt at start-up costs too much
    @Volatile private var conversation: Conversation? = null
    @Volatile private var cancelled = false
    @Volatile private var saving: Job? = null

    private fun models() = File(context.filesDir, "models").apply { mkdirs() }

    /** Only plain .litertlm names from our own catalogue, so a call can never reach outside the models folder. */
    private fun fileArg(call: PluginCall): String? =
        call.getString("file")?.takeIf { Regex("^[A-Za-z0-9._-]+\\.litertlm$").matches(it) }
            ?: run { call.reject("bad-file"); null }

    @PluginMethod
    fun installed(call: PluginCall) {
        val files = models().list().orEmpty().filter { it.endsWith(".litertlm") }
        call.resolve(JSObject().put("files", JSArray(files)))
    }

    @PluginMethod
    fun save(call: PluginCall) {
        val file = fileArg(call) ?: return
        if (saving?.isActive == true) return call.reject("busy")
        if (models().usableSpace < (call.getLong("bytes") ?: 0L)) return call.reject("not-enough-space")
        val url = call.getString("url")
        if (url == null) {
            val pick = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            return startActivityForResult(call, pick, "picked")
        }
        if (!url.startsWith("https://huggingface.co/")) return call.reject("bad-url")
        val expected = call.getLong("bytes") ?: -1L
        save(call, file) { part, write ->
            // Mobile connections stall; resume from what is already on disk instead of starting a 2.6 GB file again.
            var attempt = 0
            while (true) {
                val have = part.length()
                val c = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 30_000
                    readTimeout = 60_000
                    if (have > 0) setRequestProperty("Range", "bytes=$have-")
                }
                try {
                    val resumed = c.responseCode == HttpURLConnection.HTTP_PARTIAL
                    if (!resumed && c.responseCode != HttpURLConnection.HTTP_OK) throw IOException("HTTP ${c.responseCode}")
                    val total = if (resumed) have + c.contentLengthLong else c.contentLengthLong.takeIf { it > 0 } ?: expected
                    c.inputStream.use { write(it, resumed, total) }
                    return@save
                } catch (e: IOException) {
                    if (++attempt >= 5) throw e
                } finally {
                    c.disconnect()
                }
            }
        }
    }

    @ActivityCallback
    private fun picked(call: PluginCall, result: ActivityResult) {
        val file = fileArg(call) ?: return
        val uri = result.data?.data ?: return call.reject("cancelled")
        val resolver = context.contentResolver
        val size = resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { if (it.moveToFirst()) it.getLong(0) else -1L } ?: -1L
        save(call, file) { _, write -> (resolver.openInputStream(uri) ?: error("cannot open file")).use { write(it, false, size) } }
    }

    /**
     * Fills a .part file and renames it at the end, so a stopped copy never looks installed. `fill` gets the part file
     * and a writer (input, append, total bytes) that reports progress.
     */
    private fun save(call: PluginCall, file: String, fill: suspend CoroutineScope.(File, suspend (InputStream, Boolean, Long) -> Unit) -> Unit) {
        saving = scope.launch {
            val part = File(models(), "$file.part")
            try {
                var lastPercent = -1
                fill(part) { src, append, total ->
                    var done = if (append) part.length() else 0L
                    FileOutputStream(part, append).use { out ->
                        val buffer = ByteArray(1 shl 20)
                        while (true) {
                            ensureActive()
                            val n = src.read(buffer)
                            if (n < 0) break
                            out.write(buffer, 0, n)
                            done += n
                            val percent = if (total > 0) (done * 100 / total).toInt() else 0
                            if (percent != lastPercent) {
                                lastPercent = percent
                                notifyListeners("progress", JSObject().put("fraction", if (total > 0) done.toDouble() / total else 0.0))
                            }
                        }
                    }
                }
                if (!part.renameTo(File(models(), file))) error("rename failed")
                call.resolve()
            } catch (e: Exception) {
                part.delete()
                call.reject(if (saving?.isCancelled == true) "cancelled" else "failed", e)
            }
        }
    }

    @PluginMethod
    fun cancelSave(call: PluginCall) {
        saving?.cancel()
        call.resolve()
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val file = fileArg(call) ?: return
        scope.launch {
            engineLock.withLock { if (engineFile == file) closeEngine() }
            File(models(), file).delete()
            File(models(), "$file.part").delete()
            call.resolve()
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val file = fileArg(call) ?: return
        val system = call.getString("system") ?: ""
        val prompt = call.getString("prompt") ?: return call.reject("no-prompt")
        val maxTokens = call.getInt("maxTokens") ?: 768
        cancelled = false
        scope.launch {
            try {
                engineLock.withLock {
                    val config = ConversationConfig(
                        systemInstruction = Contents.of(system),
                        samplerConfig = SamplerConfig(topK = 40, topP = 0.95, temperature = 0.2),
                        maxOutputToken = maxTokens,
                    )
                    var streamed = false
                    // A fresh conversation per answer: each answer stands on its own sources, with no earlier turns.
                    suspend fun answer() = engineFor(file).createConversation(config).use { c ->
                        conversation = c
                        try {
                            c.sendMessageAsync(prompt).collect {
                                streamed = true
                                notifyListeners("text", JSObject().put("delta", textOf(it)))
                            }
                        } finally {
                            conversation = null
                        }
                    }
                    try {
                        answer()
                    } catch (e: Exception) {
                        // Some GPUs load the model but fail on the first answer (e.g. "Can not find OpenCL library"):
                        // switch this device to the CPU for good and try once more.
                        if (cancelled || streamed || !onGpu) throw e
                        gpuWorks = false
                        closeEngine()
                        answer()
                    }
                }
                call.resolve()
            } catch (e: Exception) {
                if (cancelled) call.resolve() else call.reject("failed", e)
            }
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        cancelled = true
        conversation?.cancelProcess()
        call.resolve()
    }

    @PluginMethod
    fun unload(call: PluginCall) {
        scope.launch {
            engineLock.withLock { closeEngine() }
            call.resolve()
        }
    }

    private fun textOf(m: Message) = m.contents.contents.filterIsInstance<Content.Text>().joinToString("") { it.text }

    /** One model in memory at a time. Loading takes seconds, so the engine is kept between answers. */
    private fun engineFor(file: String): Engine {
        engine?.takeIf { engineFile == file }?.let { return it }
        closeEngine()
        val path = File(models(), file).path
        fun load(backend: Backend) =
            Engine(EngineConfig(modelPath = path, backend = backend, maxNumTokens = 4096, cacheDir = context.cacheDir.path)).also { it.initialize() }
        onGpu = false
        val loaded = try {
            if (!gpuWorks) error("GPU failed before on this device")
            load(Backend.GPU()).also { onGpu = true }
        } catch (e: Exception) {
            load(Backend.CPU()) // no usable GPU (emulators, older phones)
        }
        engine = loaded
        engineFile = file
        return loaded
    }

    private fun closeEngine() {
        engine?.close()
        engine = null
        engineFile = null
    }

    override fun handleOnDestroy() {
        saving?.cancel()
        conversation?.cancelProcess()
        engine?.close()
        super.handleOnDestroy()
    }
}
