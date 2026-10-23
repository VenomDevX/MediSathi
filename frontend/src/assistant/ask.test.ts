import { beforeAll, describe, expect, it } from 'vitest'
import guidance from '../../../content/guidance.json'
import rules from '../../../content/emergency_rules.json'
import { listChats, listMessages } from '../data/chats'
import { seedIfNeeded, type SeedContent } from '../database/seed'
import { openTestDb } from '../database/testDb'
import type { Database } from '../database/types'
import type { EmergencyRule } from '../domain/emergency'
import { ask } from './ask'

let db: Database
beforeAll(async () => {
  db = await openTestDb()
  await seedIfNeeded(db, { version: 't', guidance, labCatalogue: [], donors: [] } as unknown as SeedContent)
})

const base = { rules: rules as EmergencyRule[], lang: 'en' as const, unknownText: 'Not known' }

describe('ask', () => {
  it('starts a chat, then keeps adding to it', async () => {
    const first = await ask({ db, owner: 'u1', chatId: null, question: 'bacche ko bukhar hai', ...base })
    expect(first.reply.kind).toBe('composed')
    const second = await ask({ db, owner: 'u1', chatId: first.chatId, question: 'saanp ne kaata', ...base })
    expect(second.chatId).toBe(first.chatId)
    expect(second.reply.kind).toBe('emergency')
    expect((await listMessages(db, 'u1', first.chatId)).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect((await listChats(db, 'u1')).map((c) => c.title)).toContain('bacche ko bukhar hai')
  })

  it('saves the given text for a question the library cannot answer', async () => {
    const { chatId, reply } = await ask({ db, owner: 'u2', chatId: null, question: 'qwxz plorb', ...base })
    expect(reply.kind).toBe('unknown')
    expect((await listMessages(db, 'u2', chatId)).at(-1)?.content).toBe('Not known')
  })
})
