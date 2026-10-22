import type { MessageKind, Source } from '../data/chats'
import type { Guidance } from '../data/guidance'
import type { Database } from '../database/types'
import { ruleText, type EmergencyRule } from '../domain/emergency'
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
  /** Items that come before the library, e.g. a checked report the person is asking about (reportSource). */
  extra?: Guidance[]
  onPartial?: (text: string) => void
  signal?: AbortSignal
}): Promise<Reply> {
  const plan = await planReply(o.db, o.rules, o.question, o.lang)
  if (plan.kind === 'emergency') return { kind: 'emergency', content: ruleText(plan.rule.instruction, o.lang), sources: [{ id: plan.rule.id, title: ruleText(plan.rule.title, o.lang) }] }
  const items = [...(o.extra ?? []), ...(plan.kind === 'grounded' ? plan.sources : [])].slice(0, 3)
  if (!items.length) return { kind: 'unknown', content: '', sources: [] }

  const sources = items.map((s) => ({ id: s.id, title: s.title }))
  const composed: Reply = { kind: 'composed', content: composeAnswer(items, o.lang), sources }
  const texts = items.map(sourceText)
  try {
    const model = await o.model
    if (!model || (model.online && o.extra?.length)) return composed // a person's report never leaves the device
    let rejected = false
    const text = await model.stream(
      groundedPrompt(items, o.question, o.lang),
      (soFar) => {
        if (!checkAnswer(soFar, texts, { partial: true }).ok) return !(rejected = true)
        o.onPartial?.(soFar)
      },
      o.signal,
      { question: o.question, lang: o.lang, sourceIds: items.map((s) => s.id) },
    )
    if (rejected || !checkAnswer(text, texts).ok) return composed
    return { kind: model.online ? 'online' : 'answer', content: text.trim(), sources }
  } catch (e) {
    console.warn('Model answer failed; answering from the library.', e)
    return composed
  }
}
