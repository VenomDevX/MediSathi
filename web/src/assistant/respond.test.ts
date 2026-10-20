import { beforeAll, describe, expect, it, vi } from 'vitest'
import guidance from '../../../content/guidance.json'
import rules from '../../../content/emergency_rules.json'
import { openTestDb } from '../database/testDb'
import { seedIfNeeded, type SeedContent } from '../database/seed'
import type { Database } from '../database/types'
import type { EmergencyRule } from '../domain/emergency'
import type { ChatModel } from './models'
import { respond } from './respond'

let db: Database
beforeAll(async () => {
  db = await openTestDb()
  await seedIfNeeded(db, { version: 't', guidance, labCatalogue: [], donors: [] } as unknown as SeedContent)
})
const base = { rules: rules as EmergencyRule[], lang: 'en' as const }

/** A model that streams the given text in small pieces. */
const fake = (text: string): ChatModel & { calls: number } => ({
  name: 'fake',
  calls: 0,
  async stream(_messages, onText) {
    this.calls++
    let out = ''
    for (const piece of text.match(/[\s\S]{1,4}/g) ?? []) {
      out += piece
      if (onText(out) === false) return out
    }
    return out
  },
})

const reportItem = {
  id: 'report:r1', title: 'Your report: cbc.png', language: 'en', topic: 'report:r1', category: 'report', summary: 'Values from your report.',
  content: 'Haemoglobin: 9.8 g/dL, low (usual range 12.0 to 15.5, printed on the report). This can be a sign of anaemia.',
  source_name: 'Your report', source_reference: null, reviewed: 0, reviewed_at: null, limitations: 'Only a doctor can say what it means for you.', audience: 'public', version: '1',
} as const

describe('respond with a report', () => {
  it('answers from the report first, even when the library has nothing on the question', async () => {
    const r = await respond({ ...base, db, question: 'is my result okay?', extra: [reportItem] })
    expect(r.kind).toBe('composed')
    expect(r.sources[0]).toEqual({ id: 'report:r1', title: 'Your report: cbc.png' })
    expect(r.content).toContain('Haemoglobin: 9.8 g/dL')
  })

  it('lets the model quote the report’s numbers', async () => {
    const r = await respond({ ...base, db, question: 'what does low haemoglobin mean', extra: [reportItem], model: fake('* Your haemoglobin is 9.8, below 12.0 [1].') })
    expect(r).toMatchObject({ kind: 'answer', content: '* Your haemoglobin is 9.8, below 12.0 [1].' })
  })

  it('still puts emergencies first', async () => {
    const r = await respond({ ...base, db, question: 'snake bite', extra: [reportItem] })
    expect(r.kind).toBe('emergency')
  })
})

describe('respond', () => {
  it('never calls the model for an emergency', async () => {
    const model = fake('anything [1]')
    const r = await respond({ ...base, db, question: 'snake bite', model })
    expect(r.kind).toBe('emergency')
    expect(model.calls).toBe(0)
  })

  it('does not wait for model detection before an emergency reply', async () => {
    const r = await respond({ ...base, db, question: 'snake bite', model: new Promise<never>(() => {}) })
    expect(r.kind).toBe('emergency')
  })

  it('accepts the model as a promise (detected while the library is searched)', async () => {
    const r = await respond({ ...base, db, question: 'child has fever', model: Promise.resolve(fake('* Rest. [1]')) })
    expect(r.kind).toBe('answer')
  })

  it('keeps a grounded, cited model answer and shows it while it streams', async () => {
    const onPartial = vi.fn()
    const r = await respond({ ...base, db, question: 'child has fever', model: fake('* Rest and drink plenty of water. [1]'), onPartial })
    expect(r).toMatchObject({ kind: 'answer', content: '* Rest and drink plenty of water. [1]' })
    expect(r.sources[0].id).toBe('fever-en')
    expect(onPartial).toHaveBeenCalled()
  })

  it('stops a stream that invents a dose and uses the library words instead', async () => {
    const model = fake('* Give 500 mg paracetamol every hour and keep going with lots more text here. [1]')
    const r = await respond({ ...base, db, question: 'child has fever', model })
    expect(r.kind).toBe('composed')
    expect(r.content).toContain('Rest and drink plenty of water')
  })

  it('uses the library words when the model fails or is missing', async () => {
    const broken: ChatModel = { name: 'broken', stream: async () => { throw new Error('offline') } }
    expect((await respond({ ...base, db, question: 'child has fever', model: broken })).kind).toBe('composed')
    expect((await respond({ ...base, db, question: 'child has fever' })).kind).toBe('composed')
  })

  it('does not call the model when the library has nothing', async () => {
    const model = fake('x [1]')
    expect((await respond({ ...base, db, question: 'best phone under 10000', model })).kind).toBe('unknown')
    expect(model.calls).toBe(0)
  })
})
