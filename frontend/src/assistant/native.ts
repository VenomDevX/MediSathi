// Gemma on Android: the native LiteRT-LM engine (android/app/.../GemmaPlugin.kt), GPU with CPU fallback.
// Model files live in the app's private storage; the JS catalogue (modelFiles.ts) says which file is which.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { ChatModel } from './models'

export interface GemmaPlugin {
  /** Finished model files in app storage. */
  installed(): Promise<{ files: string[] }>
  /** Downloads `url` into `file`, or with no url lets the person pick the file. Emits 'progress'. */
  save(o: { file: string; url?: string; bytes: number }): Promise<void>
  cancelSave(): Promise<void>
  remove(o: { file: string }): Promise<void>
  /** Streams the answer as 'text' events; resolves when it ends or is cancelled. */
  generate(o: { file: string; system: string; prompt: string; maxTokens: number }): Promise<void>
  cancel(): Promise<void>
  unload(): Promise<void>
  addListener(event: 'text', fn: (e: { delta: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'progress', fn: (e: { fraction: number }) => void): Promise<PluginListenerHandle>
}

export const Gemma = registerPlugin<GemmaPlugin>('Gemma')

export function nativeModel(plugin: GemmaPlugin, file: string): ChatModel {
  return {
    name: file,
    async stream(messages, onText, signal) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
      const prompt = messages.findLast((m) => m.role === 'user')?.content ?? ''
      let text = ''
      let stopped = false
      const stop = () => {
        if (!stopped) void plugin.cancel()
        stopped = true
      }
      const handle = await plugin.addListener('text', ({ delta }) => {
        if (stopped) return
        text += delta
        if (onText(text) === false) stop()
      })
      signal?.addEventListener('abort', stop)
      if (signal?.aborted) stop()
      try {
        // A fresh conversation per answer on the native side too: each answer stands on its own sources.
        if (!stopped) await plugin.generate({ file, system, prompt, maxTokens: 768 })
        return text
      } finally {
        signal?.removeEventListener('abort', stop)
        await handle.remove()
      }
    },
  }
}
