import type { MessageKind, Source } from '../data/chats'
import type { Database } from '../database/types'
import type { EmergencyRule } from '../domain/emergency'
import type { Lang } from '../i18n'
import { composeAnswer, planReply } from './answer'
import { checkAnswer } from './guard'
import { groundedPrompt, sourceText, type ChatModel } from './models'

export type Reply = { kind: MessageKind; content: string; sources: Source[] }

/**
 * Emergency rules, then the library, then (optionally) the model. The model only rewords library items, and any
 * answer the guard rejects, or any model failure, falls back to the library's own words.
 */
export async function respond(o: {
  db: Database
  rules: EmergencyRule[]
  question: string
  lang: Lang
  /** May be a promise, so model detection runs alongside the library search; emergencies never wait for it. */
  model?: ChatModel | Promise<ChatModel | undefined>
  onPartial?: (text: string) => void
  signal?: AbortSignal
}): Promise<Reply> {
  const plan = await planReply(o.db, o.rules, o.question, o.lang)
  if (plan.kind === 'emergency') return { kind: 'emergency', content: plan.rule.instruction[o.lang], sources: [{ id: plan.rule.id, title: plan.rule.title[o.lang] }] }
  if (plan.kind === 'unknown') return { kind: 'unknown', content: '', sources: [] }

  const sources = plan.sources.map((s) => ({ id: s.id, title: s.title }))
  const composed: Reply = { kind: 'composed', content: composeAnswer(plan.sources, o.lang), sources }
  const texts = plan.sources.map(sourceText)
  try {
    const model = await o.model
    if (!model) return composed
    let rejected = false
    const text = await model.stream(
      groundedPrompt(plan.sources, o.question, o.lang),
      (soFar) => {
        if (!checkAnswer(soFar, texts, { partial: true }).ok) return !(rejected = true)
        o.onPartial?.(soFar)
      },
      o.signal,
    )
    if (rejected || !checkAnswer(text, texts).ok) return composed
    return { kind: 'answer', content: text.trim(), sources }
  } catch {
    return composed
  }
}
