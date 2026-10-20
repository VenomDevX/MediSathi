// Gemma with Google's LiteRT-LM engine: inside the browser (WebGPU), or natively on Android (native.ts).
// No server, no internet once the model is downloaded.
import { Capacitor } from '@capacitor/core'
import type { ConversationConfig, Message } from '@litert-lm/core'
import type { ChatModel } from './models'
import { installedModels, MODELS, openModel, type ModelId } from './modelFiles'
import { Gemma, nativeModel } from './native'

const native = Capacitor.isNativePlatform()

/** The part of the LiteRT-LM engine the assistant uses; tests pass a double. */
export type EngineLike = {
  createConversation(config?: ConversationConfig): Promise<{
    sendMessageStreaming(message: string): ReadableStream<Message>
    cancel(): void
    delete(): Promise<void>
  }>
}

const textOf = (m: Message) =>
  typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('')

export function litertModel(name: string, engine: () => Promise<EngineLike>): ChatModel {
  return {
    name,
    async stream(messages, onText, signal) {
      const system = messages.filter((m) => m.role === 'system').map(({ role, content }) => ({ role, content }))
      const question = messages.findLast((m) => m.role === 'user')?.content ?? ''
      // A fresh conversation per answer: each answer stands on its own sources, with no earlier turns.
      const conversation = await (await engine()).createConversation({
        preface: { messages: system },
        sessionConfig: { maxOutputTokens: 768, samplerParams: { type: 1 /* TOP_K */, k: 40, temperature: 0.2 } },
      })
      const stop = () => conversation.cancel()
      signal?.addEventListener('abort', stop)
      let text = ''
      try {
        const reader = conversation.sendMessageStreaming(question).getReader()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) return text
          text += textOf(value)
          if (signal?.aborted || onText(text) === false) {
            stop()
            return text
          }
        }
      } finally {
        signal?.removeEventListener('abort', stop)
        await conversation.delete().catch(() => {})
      }
    },
  }
}

/** 'auto' uses the best model on this device; 'off' always answers from the library alone. Saved on this device. */
export type ModelChoice = 'auto' | 'off' | ModelId
const CHOICE_KEY = 'medisaathi.model'

export function getModelChoice(): ModelChoice {
  try {
    return (localStorage.getItem(CHOICE_KEY) as ModelChoice | null) ?? 'auto'
  } catch {
    return 'auto'
  }
}

export function setModelChoice(c: ModelChoice) {
  try {
    localStorage.setItem(CHOICE_KEY, c)
  } catch {}
}

export function chooseModel(choice: ModelChoice, installed: ModelId[]): ModelId | undefined {
  if (choice === 'off') return undefined
  if (installed.includes(choice as ModelId)) return choice as ModelId
  return installed.find((m) => m === 'gemma-4-e2b') ?? installed[0]
}

/** LiteRT-LM in the browser needs WebGPU; on Android the native engine falls back to the CPU. */
export async function canRunModels(): Promise<boolean> {
  if (native) return true
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !!(await gpu?.requestAdapter())
  } catch {
    return false
  }
}

// One engine per model, loaded on first use and kept: loading reads the whole file into the GPU (seconds).
const engines = new Map<ModelId, Promise<EngineLike & { delete(): Promise<void> }>>()

function engineFor(id: ModelId) {
  let e = engines.get(id)
  if (!e) {
    e = (async () => {
      const [{ Engine, getOrLoadGlobalLiteRtLm }, { version }] = await Promise.all([import('@litert-lm/core'), import('@litert-lm/core/package.json')])
      await getOrLoadGlobalLiteRtLm(`/litert/${version}/`) // our own copy of the runtime (scripts/copy-assets.mjs), so it works offline
      return Engine.create({ model: await openModel(id), mainExecutorSettings: { maxNumTokens: 4096 } })
    })()
    e.catch(() => engines.delete(id)) // a failed load can be retried on the next question
    engines.set(id, e)
  }
  return e
}

/** Frees the GPU memory a model holds (before its file is deleted, or when switching models). */
export async function unloadModel(id: ModelId) {
  if (native) return Gemma.unload()
  const e = engines.get(id)
  engines.delete(id)
  await e?.then((x) => x.delete()).catch(() => {})
}

/** The model for the next answer, or undefined to answer from the library. */
export async function pickModel(): Promise<ChatModel | undefined> {
  const choice = getModelChoice()
  if (choice === 'off') return undefined
  const id = chooseModel(choice, await installedModels())
  if (!id || !(await canRunModels())) return undefined
  if (native) return nativeModel(Gemma, MODELS[id].file) // the plugin keeps one model loaded and swaps on demand
  for (const other of engines.keys()) if (other !== id) void unloadModel(other) // one model in GPU memory at a time
  return litertModel(id, () => engineFor(id))
}
