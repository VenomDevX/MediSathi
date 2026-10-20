// Chats belong to one account (`owner`, the signed-in user id): other accounts on the device never see or add to them.
import type { Database } from '../database/types'

export type Chat = { id: string; title: string; report_id: string | null; created_at: string }
export type MessageKind = 'answer' | 'composed' | 'emergency' | 'unknown'
/** A library item an answer is based on (or, for an emergency reply, the rule that matched). */
export type Source = { id: string; title: string }
export type Message = { id: string; role: 'user' | 'assistant'; content: string; kind: MessageKind; sources: Source[]; created_at: string }

/** `reportId`: the checked report this chat is about; its values are a source for every answer. */
export async function createChat(db: Database, owner: string, title: string, reportId: string | null = null): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([{ sql: 'INSERT INTO chats (id, owner_id, title, report_id) VALUES (?, ?, ?, ?)', bind: [id, owner, title.slice(0, 80), reportId] }])
  return id
}

export async function getChat(db: Database, owner: string, id: string): Promise<Chat | undefined> {
  return (await db.query<Chat>('SELECT id, title, report_id, created_at FROM chats WHERE id = ? AND owner_id = ?', [id, owner]))[0]
}

const owned = 'SELECT id FROM chats WHERE owner_id = ?'

export async function addMessage(
  db: Database,
  owner: string,
  chatId: string,
  m: { role: Message['role']; content: string; kind?: MessageKind; sources?: Source[] },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([
    {
      sql: `INSERT INTO messages (id, chat_id, role, content, kind, sources_json) SELECT ?, ?, ?, ?, ?, ? WHERE ? IN (${owned})`,
      bind: [id, chatId, m.role, m.content, m.kind ?? 'answer', JSON.stringify(m.sources ?? []), chatId, owner],
    },
  ])
  return id
}

// Ordered by insertion (rowid), not timestamps: two writes in the same millisecond must keep their order.
export async function listMessages(db: Database, owner: string, chatId: string): Promise<Message[]> {
  const rows = await db.query<Omit<Message, 'sources'> & { sources_json: string }>(
    `SELECT id, role, content, kind, sources_json, created_at FROM messages WHERE chat_id = ? AND chat_id IN (${owned}) ORDER BY rowid`,
    [chatId, owner],
  )
  return rows.map(({ sources_json, ...m }) => ({ ...m, sources: JSON.parse(sources_json) }))
}

/** Most recently active first. */
export async function listChats(db: Database, owner: string): Promise<Chat[]> {
  return db.query<Chat>(
    `SELECT c.id, c.title, c.report_id, c.created_at FROM chats c WHERE c.owner_id = ?
     ORDER BY (SELECT max(m.rowid) FROM messages m WHERE m.chat_id = c.id) DESC NULLS LAST, c.rowid DESC`,
    [owner],
  )
}

export async function deleteChat(db: Database, owner: string, id: string): Promise<void> {
  await db.batch([{ sql: 'DELETE FROM chats WHERE id = ? AND owner_id = ?', bind: [id, owner] }])
}
