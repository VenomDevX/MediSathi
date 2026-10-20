import { describe, expect, it } from 'vitest'
import catalogue from '../../../content/lab_catalogue.json'
import { checkRange, findTest, parseReport, type LabTest } from './labs'

const cat = catalogue as unknown as LabTest[]

describe('findTest', () => {
  it('matches aliases case-insensitively and prefers the longest alias', () => {
    expect(findTest(cat, 'HbA1c')?.id).toBe('hba1c')
    expect(findTest(cat, 'Hb')?.id).toBe('haemoglobin')
    expect(findTest(cat, 'Haemoglobin (Hb)')?.id).toBe('haemoglobin')
    expect(findTest(cat, 'Glucose Fasting')?.id).toBe('fbs')
  })

  it('returns undefined for tests not in the catalogue', () => {
    expect(findTest(cat, 'Serum ferritin')).toBeUndefined()
  })
})

describe('checkRange', () => {
  const hb = findTest(cat, 'Hb')!

  it('uses the range printed on the report when there is one', () => {
    const r = checkRange(hb, { value: '11.8', unit: 'g/dL', range_low: '11.0', range_high: '15.0' }, 'F')
    expect(r).toMatchObject({ status: 'normal', rangeSource: 'report', low: 11, high: 15 })
  })

  it('falls back to the catalogue range for the patient sex when the report has none', () => {
    expect(checkRange(hb, { value: '12.5', unit: 'g/dL' }, 'F')).toMatchObject({ status: 'normal', rangeSource: 'catalogue', low: 12, high: 15.5 })
    expect(checkRange(hb, { value: '12.5', unit: 'g/dL' }, 'M')).toMatchObject({ status: 'low', rangeSource: 'catalogue', low: 13.5 })
  })

  it('uses the widest range when sex is unknown and the range is sex-specific', () => {
    expect(checkRange(hb, { value: '12.5', unit: 'g/dL' }, null)).toMatchObject({ status: 'normal', low: 12, high: 17.5 })
  })

  it('treats values exactly on the boundary as normal', () => {
    expect(checkRange(hb, { value: '12.0', unit: 'g/dL' }, 'F').status).toBe('normal')
    expect(checkRange(hb, { value: '15.5', unit: 'g/dL' }, 'F').status).toBe('normal')
  })

  it('converts units before comparing with the catalogue range', () => {
    const fbs = findTest(cat, 'FBS')!
    expect(checkRange(fbs, { value: '7.2', unit: 'mmol/L' }, null)).toMatchObject({ status: 'high', rangeSource: 'catalogue' })
    const plt = findTest(cat, 'Platelet count')!
    expect(checkRange(plt, { value: '1.2', unit: 'lakhs/cumm' }, null).status).toBe('low')
  })

  it('refuses to judge a value with an unknown unit and no printed range', () => {
    expect(checkRange(hb, { value: '120', unit: 'mg/mL' }, 'F')).toMatchObject({ status: 'unknown', reason: 'unit' })
  })

  it('refuses to judge a value that is not a number', () => {
    expect(checkRange(hb, { value: '1l.5', unit: 'g/dL' }, 'F')).toMatchObject({ status: 'unknown', reason: 'value' })
  })

  it('ignores a printed range that is reversed or empty and uses the catalogue instead', () => {
    const tsh = findTest(cat, 'TSH')!
    expect(checkRange(tsh, { value: '2.1', unit: 'mIU/L', range_low: '04', range_high: '4.0' }, null)).toMatchObject({ status: 'normal', rangeSource: 'catalogue' })
  })

  it('handles "less than" style printed ranges', () => {
    const chol = findTest(cat, 'Total cholesterol')!
    expect(checkRange(chol, { value: '232', unit: 'mg/dL', range_low: '', range_high: '200' }, null)).toMatchObject({ status: 'high', rangeSource: 'report' })
  })
})

describe('parseReport', () => {
  const lines = [
    { text: 'CITY DIAGNOSTICS LAB, SITAPUR', confidence: 95 },
    { text: 'Patient: Kamla Yadav   Age/Sex: 27/F', confidence: 92 },
    { text: 'Haemoglobin (Hb)   9.8   g/dL   12.0 - 15.5', confidence: 91 },
    { text: 'Platelet Count   1.4   lakhs/cumm   1.5 - 4.5', confidence: 88 },
    { text: 'Fasting Blood Sugar   126   mg/dL   70 - 99', confidence: 55 },
    { text: 'Total Cholesterol   182   mg/dL   < 200', confidence: 90 },
    { text: 'Serum Ferritin   8   ng/mL   13 - 150', confidence: 90 },
  ]

  it('extracts name, value, unit and printed range for catalogue tests', () => {
    const fields = parseReport(lines, cat)
    expect(fields.find((f) => f.test_id === 'haemoglobin')).toMatchObject({ value: '9.8', unit: 'g/dL', range_low: '12.0', range_high: '15.5' })
    expect(fields.find((f) => f.test_id === 'platelets')).toMatchObject({ value: '1.4', unit: 'lakhs/cumm', range_low: '1.5', range_high: '4.5' })
    expect(fields.find((f) => f.test_id === 'cholesterol')).toMatchObject({ value: '182', range_low: '', range_high: '200' })
  })

  it('flags low-confidence lines as uncertain instead of guessing', () => {
    const fbs = parseReport(lines, cat).find((f) => f.test_id === 'fbs')!
    expect(fbs.uncertain).toBe(true)
    expect(fbs.value).toBe('126')
  })

  it('keeps the original line for every field', () => {
    const hb = parseReport(lines, cat).find((f) => f.test_id === 'haemoglobin')!
    expect(hb.raw).toBe('Haemoglobin (Hb)   9.8   g/dL   12.0 - 15.5')
  })

  it('ignores lines that are not catalogue tests', () => {
    expect(parseReport(lines, cat).map((f) => f.test_id)).toEqual(['haemoglobin', 'platelets', 'fbs', 'cholesterol'])
  })

  it('flags a value that is impossible for the test (OCR dropped a decimal point)', () => {
    const [f] = parseReport([{ text: 'Haemoglobin (Hb)  98  g/dL', confidence: 95 }], cat)
    expect(f.uncertain).toBe(true)
  })

  it('flags a value far outside its own printed range, a sign of a lost decimal point', () => {
    const [f] = parseReport([{ text: 'TSH  21  mIU/L  0.4 - 4.0', confidence: 95 }], cat)
    expect(f.uncertain).toBe(true)
  })

  it('flags a printed range that is reversed or impossible', () => {
    const [f] = parseReport([{ text: 'Haemoglobin  9.8  g/dL  120 - 155', confidence: 95 }], cat)
    expect(f.uncertain).toBe(true)
  })

  it('does not flag plausible values', () => {
    const [f] = parseReport([{ text: 'Platelet Count  1.4  lakhs/cumm  1.5 - 4.5', confidence: 95 }], cat)
    expect(f.uncertain).toBe(false)
  })

  it('flags a value with letters OCR often confuses with digits', () => {
    const [f] = parseReport([{ text: 'Hemoglobin  1O.2  g/dL', confidence: 95 }], cat)
    expect(f.uncertain).toBe(true)
  })
})
