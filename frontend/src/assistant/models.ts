// A local language model the assistant can use to explain library items in its own words.
// Two runtimes: Ollama on a laptop/desktop (ollama.ts) and Gemma on Android (native plugin, Android phase).
import type { Guidance } from '../data/guidance'
import type { Lang } from '../i18n'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatModel {
  name: string
  /** Streams the reply; onText gets the whole text so far and may return false to stop early. Resolves with the final text. */
  stream(messages: ChatMessage[], onText: (soFar: string) => boolean | void, signal?: AbortSignal): Promise<string>
}

export const sourceText = (g: Guidance) => [g.title, g.summary, g.content, g.limitations].filter(Boolean).join('\n')

const system = (lang: Lang) => `You are MediSaathi, a friendly helper that explains first-aid and home-care information to families in India.
Rules:
1. Use ONLY the numbered sources. Do not add facts, medicines, numbers or advice that are not in them.
2. Never say what illness the person has. Never name a medicine or a dose.
3. Reply in ${lang === 'hi' ? 'Hindi (Devanagari script)' : 'English'}, in simple everyday words: 3 to 6 short bullet points.
4. After each point, write the source number, like [1].
5. Finish with when to see a doctor, taken from the sources.
6. If the sources do not answer the question, reply with exactly: NO_ANSWER`

/** One question, answered only from the given sources. No chat history: each answer stands on its own sources. */
export function groundedPrompt(sources: Guidance[], question: string, lang: Lang): ChatMessage[] {
  const numbered = sources.map((g, i) => `[${i + 1}] ${sourceText(g)}`).join('\n\n')
  return [
    { role: 'system', content: system(lang) },
    { role: 'user', content: `Sources:\n${numbered}\n\nQuestion: ${question}` },
  ]
}
