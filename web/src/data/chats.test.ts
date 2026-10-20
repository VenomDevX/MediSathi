import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { addMessage, createChat, deleteChat, listChats, listMessages } from './chats'

describe('chats', () => {
  it('keeps messages in order with their sources, newest chat first', async () => {
    const db = await openTestDb()
    const a = await createChat(db, 'Fever')
    const b = await createChat(db, 'Burn')
    await addMessage(db, a, { role: 'user', content: 'bukhar hai' })
    await addMessage(db, a, { role: 'assistant', content: 'Rest…', kind: 'answer', sources: [{ id: 'fever-hi', title: 'बुखार' }] })
    const msgs = await listMessages(db, a)
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].sources).toEqual([{ id: 'fever-hi', title: 'बुखार' }])
    expect((await listChats(db)).map((c) => c.id)).toEqual([a, b]) // a has the latest message
  })

  it('deletes a chat with its messages', async () => {
    const db = await openTestDb()
    const a = await createChat(db, 'Fever')
    await addMessage(db, a, { role: 'user', content: 'x' })
    await deleteChat(db, a)
    expect(await listChats(db)).toEqual([])
    expect(await listMessages(db, a)).toEqual([])
  })
})
