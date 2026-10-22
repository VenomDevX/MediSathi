// Optional online explanation (prototype): Gemini, through our own server so the API key never ships in the app.
// Only the question, its language and the matched library card ids are sent; the server rebuilds the same prompt
// from its own copy of the library, so it cannot be used for arbitrary prompts. respond() still guards the answer.
import { API_URL } from '../sync/api'
import type { ChatModel } from './models'

export function onlineModel(fetchFn: typeof fetch = fetch): ChatModel {
  return {
    name: 'gemini-online',
    online: true,
    async stream(_messages, onText, signal, grounding) {
      if (!grounding) throw new Error('online model: needs the question and library card ids')
      const res = await fetchFn(`${API_URL}/api/v1/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: grounding.question, lang: grounding.lang, sources: grounding.sourceIds }),
        signal,
      })
      if (!res.ok) throw new Error(`online model: ${res.status}`)
      const { text } = (await res.json()) as { text: string }
      onText(text)
      return text
    },
  }
}
