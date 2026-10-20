import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { addMessage, createChat, deleteChat, getChat, listChats, listMessages } from './chats'

const ME = 'u-ramesh'
const OTHER = 'u-sunita'

describe('chats', () => {
  it('keeps messages in order with their sources, newest chat first', async () => {
    const db = await openTestDb()
    const a = await createChat(db, ME, 'Fever')
    const b = await createChat(db, ME, 'Burn')
    await addMessage(db, ME, a, { role: 'user', content: 'bukhar hai' })
    await addMessage(db, ME, a, { role: 'assistant', content: 'Rest…', kind: 'answer', sources: [{ id: 'fever-hi', title: 'बुखार' }] })
    const msgs = await listMessages(db, ME, a)
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].sources).toEqual([{ id: 'fever-hi', title: 'बुखार' }])
    expect((await listChats(db, ME)).map((c) => c.id)).toEqual([a, b]) // a has the latest message
  })

  it('deletes a chat with its messages', async () => {
    const db = await openTestDb()
    const a = await createChat(db, ME, 'Fever')
    await addMessage(db, ME, a, { role: 'user', content: 'x' })
    await deleteChat(db, ME, a)
    expect(await listChats(db, ME)).toEqual([])
    expect(await listMessages(db, ME, a)).toEqual([])
  })

  it('remembers the report a chat is about', async () => {
    const db = await openTestDb()
    await db.batch([{ sql: "INSERT INTO medical_reports (id, file_reference, file_hash, file_name, ocr_text) VALUES ('r1', 'r1', 'hash1', 'cbc.png', '')" }])
    const a = await createChat(db, ME, 'Is my Hb okay?', 'r1')
    expect(await getChat(db, ME, a)).toMatchObject({ title: 'Is my Hb okay?', report_id: 'r1' })
    expect(await getChat(db, ME, await createChat(db, ME, 'Fever'))).toMatchObject({ report_id: null })
  })
})

describe('accounts on one device', () => {
  it("never shows or lets another account add to one account's chats", async () => {
    const db = await openTestDb()
    const a = await createChat(db, ME, 'Fever')
    await addMessage(db, ME, a, { role: 'user', content: 'bukhar hai' })

    expect(await listChats(db, OTHER)).toEqual([])
    expect(await getChat(db, OTHER, a)).toBeUndefined()
    expect(await listMessages(db, OTHER, a)).toEqual([])
    await addMessage(db, OTHER, a, { role: 'user', content: 'planted' })
    await deleteChat(db, OTHER, a)
    expect((await listMessages(db, ME, a)).map((m) => m.content)).toEqual(['bukhar hai'])
  })
})
