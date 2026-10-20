import { beforeAll, describe, expect, it } from 'vitest'
import guidance from '../../../content/guidance.json'
import rules from '../../../content/emergency_rules.json'
import { openTestDb } from '../database/testDb'
import { seedIfNeeded, type SeedContent } from '../database/seed'
import type { Database } from '../database/types'
import type { EmergencyRule } from '../domain/emergency'
import { composeAnswer, planReply, retrieve } from './answer'

let db: Database
beforeAll(async () => {
  db = await openTestDb()
  await seedIfNeeded(db, { version: 't', guidance, labCatalogue: [], donors: [] } as unknown as SeedContent)
})
const emergency = rules as EmergencyRule[]

describe('retrieve', () => {
  it('finds the topic in a natural Hinglish sentence, in the reader language', async () => {
    const r = await retrieve(db, 'mere bete ko kal se bukhar hai', 'en')
    expect(r[0].topic).toBe('fever')
    expect(r[0].language).toBe('en')
  })

  it('matches English word forms: burned, bleeding, fainted', async () => {
    expect((await retrieve(db, 'my hand got burned with hot oil', 'en'))[0]?.topic).toBe('burns')
    expect((await retrieve(db, 'his leg is bleeding a lot', 'en'))[0]?.topic).toBe('bleeding')
    expect((await retrieve(db, 'grandmother fainted', 'en'))[0]?.topic).toBe('fainting')
  })

  it('finds Hindi questions', async () => {
    const r = await retrieve(db, 'बुखार में क्या करें', 'hi')
    expect(r[0].id).toBe('fever-hi')
  })

  it('returns one item per topic', async () => {
    const r = await retrieve(db, 'fever bukhar बुखार', 'hi')
    expect(new Set(r.map((g) => g.topic)).size).toBe(r.length)
  })

  it('finds nothing for questions outside the library or made of filler words', async () => {
    expect(await retrieve(db, 'what is the capital of France', 'en')).toEqual([])
    expect(await retrieve(db, 'hai kya kaise', 'en')).toEqual([])
    expect(await retrieve(db, '', 'en')).toEqual([])
  })
})

describe('planReply', () => {
  it('puts emergencies first, before any search', async () => {
    const p = await planReply(db, emergency, 'saanp ne kata hai, bukhar bhi hai', 'hi')
    expect(p).toMatchObject({ kind: 'emergency', rule: { id: 'snake-bite' } })
  })

  it('answers from the library when it can', async () => {
    const p = await planReply(db, emergency, 'child has fever', 'en')
    expect(p.kind).toBe('grounded')
    if (p.kind === 'grounded') expect(p.sources[0].topic).toBe('fever')
  })

  it('says it does not know otherwise', async () => {
    expect(await planReply(db, emergency, 'best phone under 10000', 'en')).toEqual({ kind: 'unknown' })
  })
})

describe('composeAnswer', () => {
  it('gives the steps and the limits of the top source, and names related ones', async () => {
    const sources = await retrieve(db, 'fever heat', 'en')
    const text = composeAnswer(sources, 'en')
    expect(sources.length).toBeGreaterThan(1)
    expect(text).toContain(sources[0].content)
    expect(text).toContain(sources[0].limitations)
    expect(text).toContain(sources[1].title)
  })
})
