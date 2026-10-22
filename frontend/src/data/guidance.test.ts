import { describe, expect, it } from 'vitest'
import guidance from '../../../content/guidance.json'
import { openTestDb } from '../database/testDb'
import { seedIfNeeded, type SeedContent } from '../database/seed'
import { getGuidance, searchGuidance } from './guidance'

async function setup() {
  const db = await openTestDb()
  await seedIfNeeded(db, { version: 't', users: [], patients: [], labCatalogue: [], donors: [], guidance } as unknown as SeedContent)
  return db
}

describe('searchGuidance', () => {
  it('lists every item in the chosen language when the query is empty', async () => {
    const db = await setup()
    const hi = await searchGuidance(db, '', 'hi')
    expect(hi).toHaveLength(10)
    expect(hi.every((g) => g.language === 'hi')).toBe(true)
  })

  it('finds items by Hinglish keyword and shows the chosen language first', async () => {
    const db = await setup()
    const res = await searchGuidance(db, 'bukhar', 'en')
    expect(res[0].id).toBe('fever-en')
    expect(res.map((g) => g.id)).toContain('fever-hi')
  })

  it('finds Hindi words and word prefixes', async () => {
    const db = await setup()
    expect((await searchGuidance(db, 'दस्त', 'hi'))[0].id).toBe('diarrhoea-hi')
    expect((await searchGuidance(db, 'dehyd', 'en'))[0].id).toBe('diarrhoea-en')
  })

  it('does not break on punctuation or FTS syntax in the query', async () => {
    const db = await setup()
    await expect(searchGuidance(db, '"burn* OR (', 'en')).resolves.toBeDefined()
    expect((await searchGuidance(db, 'burn!!', 'en'))[0].id).toBe('burns-en')
  })

  it('opens one item with its source and review metadata', async () => {
    const db = await setup()
    const g = await getGuidance(db, 'burns-en')
    expect(g).toMatchObject({ title: 'Burns', source_name: expect.stringContaining('not clinically reviewed'), reviewed: 0, version: '1' })
  })

  it('falls back to English guidance for other Indian languages without breaking', async () => {
    const db = await setup()
    const ta = await searchGuidance(db, '', 'ta')
    expect(ta).toHaveLength(10)
    expect(ta.every((g) => g.language === 'en')).toBe(true)
  })
})
