import type { Database } from '../database/types'

export type Chat = { id: string; title: string; report_id: string | null; created_at: string }
export type MessageKind = 'answer' | 'composed' | 'emergency' | 'unknown'
/** A library item an answer is based on (or, for an emergency reply, the rule that matched). */
export type Source = { id: string; title: string }
export type Message = { id: string; role: 'user' | 'assistant'; content: string; kind: MessageKind; sources: Source[]; created_at: string }

/** `reportId`: the checked report this chat is about; its values are a source for every answer. */
export async function createChat(db: Database, title: string, reportId: string | null = null): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([{ sql: 'INSERT INTO chats (id, title, report_id) VALUES (?, ?, ?)', bind: [id, title.slice(0, 80), reportId] }])
  return id
}

export async function getChat(db: Database, id: string): Promise<Chat | undefined> {
  return (await db.query<Chat>('SELECT id, title, report_id, created_at FROM chats WHERE id = ?', [id]))[0]
}

export async function addMessage(
  db: Database,
  chatId: string,
  m: { role: Message['role']; content: string; kind?: MessageKind; sources?: Source[] },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([
    {
      sql: 'INSERT INTO messages (id, chat_id, role, content, kind, sources_json) VALUES (?, ?, ?, ?, ?, ?)',
      bind: [id, chatId, m.role, m.content, m.kind ?? 'answer', JSON.stringify(m.sources ?? [])],
    },
  ])
  return id
}

// Ordered by insertion (rowid), not timestamps: two writes in the same millisecond must keep their order.
export async function listMessages(db: Database, chatId: string): Promise<Message[]> {
  const rows = await db.query<Omit<Message, 'sources'> & { sources_json: string }>(
    'SELECT id, role, content, kind, sources_json, created_at FROM messages WHERE chat_id = ? ORDER BY rowid',
    [chatId],
  )
  return rows.map(({ sources_json, ...m }) => ({ ...m, sources: JSON.parse(sources_json) }))
}

/** Most recently active first. */
export async function listChats(db: Database): Promise<Chat[]> {
  return db.query<Chat>(
    `SELECT c.id, c.title, c.report_id, c.created_at FROM chats c
     ORDER BY (SELECT max(m.rowid) FROM messages m WHERE m.chat_id = c.id) DESC NULLS LAST, c.rowid DESC`,
  )
}

export async function deleteChat(db: Database, id: string): Promise<void> {
  await db.batch([{ sql: 'DELETE FROM chats WHERE id = ?', bind: [id] }])
}
