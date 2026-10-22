// A language model the assistant can use to explain library items in its own words.
// Gemma on the device (litert.ts in the browser, native.ts on Android), or Gemini online through our server (online.ts).
import type { Guidance } from '../data/guidance'
import { LANG_META, type Lang } from '../i18n'

export type Grounding = { question: string; lang: Lang; sourceIds: string[] }

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatModel {
  name: string
  /** True when the question leaves the device (online.ts); the chat then says the answer was explained online. */
  online?: boolean
  /**
   * Streams the reply; onText gets the whole text so far and may return false to stop early. Resolves with the final text.
   * `grounding` is what the prompt was built from; the online model sends only that, and its server rebuilds the prompt.
   */
  stream(messages: ChatMessage[], onText: (soFar: string) => boolean | void, signal?: AbortSignal, grounding?: Grounding): Promise<string>
}

export const sourceText = (g: Guidance) => [g.title, g.summary, g.content, g.limitations].filter(Boolean).join('\n')

const system = (lang: Lang) => `You are MediSaathi, a friendly helper that explains first-aid and home-care information to families in India.
Rules:
1. Use ONLY the numbered sources. Do not add facts, medicines, numbers or advice that are not in them.
2. Never say what illness the person has. Never name a medicine or a dose.
3. Reply in ${LANG_META[lang].script}, in simple everyday words: 3 to 6 short bullet points.
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

