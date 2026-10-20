import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import type { ReportField } from '../domain/labs'
import { saveProfile } from './family'
import { confirmReport, deleteReport, getReport, listReports, readResults, saveReport } from './reports'

const hb = (value: string, range_low = '12.0', range_high = '15.5'): ReportField => ({
  test_id: 'haemoglobin', name: 'Haemoglobin', value, unit: 'g/dL', range_low, range_high, uncertain: false, raw: `Haemoglobin ${value} g/dL ${range_low} - ${range_high}`,
})

describe('reports', () => {
  it('saves a read report for checking, then keeps the checked values and whose report it is', async () => {
    const db = await openTestDb()
    const id = await saveReport(db, { file_name: 'cbc.png', file_hash: 'abc', ocr_text: 'Haemoglobin 98 g/dL', fields: [{ ...hb('98'), uncertain: true }] })
    expect(await getReport(db, id)).toMatchObject({ file_name: 'cbc.png', ocr_status: 'extracted', fields: [{ value: '98', uncertain: true }] })

    const ma = await saveProfile(db, { name: 'Sunita', relation: 'mother', birth_year: null, sex: 'F', blood_group: '', conditions: '', allergies: '' })
    await confirmReport(db, id, [hb('9.8')], ma)
    expect(await getReport(db, id)).toMatchObject({ ocr_status: 'verified', profile_id: ma, profile_name: 'Sunita', profile_sex: 'F', fields: [{ value: '9.8' }] })
    expect((await listReports(db, { profileId: ma })).map((r) => r.id)).toEqual([id])
  })

  it('a deleted report is gone from every list', async () => {
    const db = await openTestDb()
    const id = await saveReport(db, { file_name: 'a.pdf', file_hash: 'h', ocr_text: '', fields: [] })
    await deleteReport(db, id)
    expect(await listReports(db)).toEqual([])
    expect(await getReport(db, id)).toBeUndefined()
  })
})

describe('readResults', () => {
  it('compares each value with its range and explains it in the reader’s language', () => {
    const [low] = readResults([hb('9.8')], 'F', 'en')
    expect(low).toMatchObject({ name: 'Haemoglobin', result: { status: 'low', rangeSource: 'report', low: 12, high: 15.5 } })
    expect(low.explanation).toMatch(/anaemia/)
    expect(readResults([hb('9.8')], 'F', 'hi')[0]).toMatchObject({ name: 'हीमोग्लोबिन', explanation: expect.stringMatching(/खून की कमी/) })
  })

  it('uses the usual range for the person’s sex when the report prints none', () => {
    expect(readResults([hb('13', '', '')], 'M', 'en')[0].result).toMatchObject({ status: 'low', rangeSource: 'catalogue', low: 13.5 })
    expect(readResults([hb('13', '', '')], 'F', 'en')[0].result).toMatchObject({ status: 'normal', rangeSource: 'catalogue' })
  })

  it('does not guess about a test it does not know', () => {
    const [r] = readResults([{ ...hb('5'), test_id: null, name: 'Zinc' }], null, 'en')
    expect(r).toMatchObject({ name: 'Zinc', result: { status: 'unknown' }, explanation: null })
  })
})
