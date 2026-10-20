// Ollama on this computer (laptop/desktop). Ollama allows browser calls from localhost pages by default;
// a deployed site needs OLLAMA_ORIGINS set to its address.
import type { ChatModel } from './models'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export const OLLAMA_URL = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434'
export const GEMMA_MODELS = ['gemma3n:e2b', 'gemma3n:e4b'] as const

/** Is Ollama running here, and which Gemma 3n models has it pulled? Never throws. */
export async function ollamaStatus(base = OLLAMA_URL, fetchFn: Fetch = fetch): Promise<{ running: boolean; models: string[] }> {
  try {
    const res = await fetchFn(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) })
    const { models } = (await res.json()) as { models: { name: string }[] }
    return { running: true, models: models.map((m) => m.name).filter((n) => n.startsWith('gemma3n:')) }
  } catch {
    return { running: false, models: [] }
  }
}

export function ollamaModel(name: string, base = OLLAMA_URL, fetchFn: Fetch = fetch): ChatModel {
  return {
    name,
    async stream(messages, onText, signal) {
      const res = await fetchFn(`${base}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({ model: name, messages, stream: true, options: { temperature: 0.2 } }),
        signal,
      })
      if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`)

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let text = ''
      let pending = ''
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) return text
          pending += value
          const lines = pending.split('\n')
          pending = lines.pop()!
          for (const l of lines) {
            if (!l.trim()) continue
            const piece = (JSON.parse(l) as { message?: { content?: string } }).message?.content
            if (!piece) continue
            text += piece
            if (onText(text) === false) return text
          }
        }
      } finally {
        void reader.cancel().catch(() => {}) // stops generation when we leave early
      }
    },
  }
}

/** 'auto' uses the best installed Gemma 3n; 'off' always answers from the library alone. Saved on this device. */
export type ModelChoice = 'auto' | 'off' | (typeof GEMMA_MODELS)[number]
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

export function chooseModel(choice: ModelChoice, installed: string[]): string | undefined {
  if (choice === 'off') return undefined
  if (installed.includes(choice)) return choice
  return installed.find((m) => m === GEMMA_MODELS[0]) ?? installed[0]
}

/** The model to use for the next answer, or undefined to answer from the library. Checked per question: Ollama may start or stop at any time. */
export async function pickModel(): Promise<ChatModel | undefined> {
  const choice = getModelChoice()
  if (choice === 'off') return undefined
  const name = chooseModel(choice, (await ollamaStatus()).models)
  return name ? ollamaModel(name) : undefined
}
