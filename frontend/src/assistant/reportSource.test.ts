import { describe, expect, it } from 'vitest'
import type { Report } from '../data/reports'
import { reportSource } from './reportSource'

const report: Report = {
  id: 'r1', patient_id: null, profile_id: null, profile_name: 'Sunita', profile_sex: 'F', file_name: 'cbc.png', file_hash: '', ocr_text: '', ocr_status: 'verified', created_at: '2026-10-20T10:00:00Z',
  fields: [
    { test_id: 'haemoglobin', name: 'Haemoglobin', value: '9.8', unit: 'g/dL', range_low: '12.0', range_high: '15.5', uncertain: false, raw: '' },
    { test_id: null, name: 'Zinc', value: '70', unit: 'ug/dL', range_low: '', range_high: '', uncertain: false, raw: '' },
  ],
}

describe('reportSource', () => {
  it('turns the checked values into a library item the assistant can cite', () => {
    const s = reportSource(report, 'en')
    expect(s).toMatchObject({ id: 'report:r1', title: 'Your report: cbc.png', language: 'en' })
    expect(s.content).toContain('Haemoglobin: 9.8 g/dL, low (usual range 12.0 to 15.5, printed on the report).')
    expect(s.content).toMatch(/anaemia/)
    expect(s.content).toContain('Zinc: 70 ug/dL. This app has no reliable information about this test.')
    expect(s.limitations).toMatch(/doctor/)
  })

  it('in Hindi', () => {
    const s = reportSource(report, 'hi')
    expect(s.title).toBe('आपकी रिपोर्ट: cbc.png')
    expect(s.content).toContain('हीमोग्लोबिन: 9.8 g/dL, कम')
  })
})
