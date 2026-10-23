// One question and its reply, saved to a chat. Shared by the Ask screen and hands-free Saathi mode.
import { addMessage, createChat } from '../data/chats'
import type { Guidance } from '../data/guidance'
import type { Database } from '../database/types'
import type { EmergencyRule } from '../domain/emergency'
import type { Lang } from '../i18n'
import type { ChatModel } from './models'
import { respond, type Reply } from './respond'

export async function ask(o: {
  db: Database
  owner: string
  /** null starts a new chat titled with the question. */
  chatId: string | null
  question: string
  lang: Lang
  rules: EmergencyRule[]
  model?: ChatModel | Promise<ChatModel | undefined>
  reportId?: string | null
  extra?: Guidance[]
  /** Text saved for an 'unknown' reply (the screen's own "I don't know" in the current language). */
  unknownText: string
  /** Called once the question is saved, before the reply is ready. */
  onSaved?: (chatId: string) => void
  onPartial?: (text: string) => void
}): Promise<{ chatId: string; reply: Reply }> {
  const chatId = o.chatId ?? (await createChat(o.db, o.owner, o.question, o.reportId ?? null))
  await addMessage(o.db, o.owner, chatId, { role: 'user', content: o.question })
  o.onSaved?.(chatId)
  const reply = await respond({ db: o.db, rules: o.rules, question: o.question, lang: o.lang, extra: o.extra, model: o.model, onPartial: o.onPartial })
  await addMessage(o.db, o.owner, chatId, { role: 'assistant', ...reply, content: reply.kind === 'unknown' ? o.unknownText : reply.content })
  return { chatId, reply }
}
