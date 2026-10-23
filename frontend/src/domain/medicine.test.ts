import { describe, expect, it } from 'vitest'
import medicines from '../../../content/medicines.json'
import { identifyMedicine, parseExpiry, strength, type Medicine } from './medicine'

const catalogue = medicines as Medicine[]
const today = new Date(2026, 9, 23)

describe('identifyMedicine', () => {
  it('finds brands and generics in noisy OCR text', () => {
    expect(identifyMedicine('D0LO 650\nParacetamol Tablets IP 650 mg', catalogue)?.id).toBe('paracetamol')
    expect(identifyMedicine('Each strip: 10 tabs ALBENDAZ0LE 400', catalogue)?.id).toBe('albendazole')
    expect(identifyMedicine('AZITHRAL-500', catalogue)?.id).toBe('azithromycin')
    expect(identifyMedicine('Iron Folic Acid tablets', catalogue)?.id).toBe('ifa')
  })

  it('allows one OCR slip in long names only', () => {
    expect(identifyMedicine('Metf0rmn 500', catalogue)?.id).toBe('metformin')
    expect(identifyMedicine('pen 40', catalogue)).toBeUndefined() // "pan" is too short to guess
    expect(identifyMedicine('batch no 1234 mfd by abc pharma', catalogue)).toBeUndefined()
  })

  it('reads the strength', () => {
    expect(strength('DOLO 650mg')).toBe('650 mg')
    expect(strength('no dose here')).toBeUndefined()
  })
})

describe('parseExpiry', () => {
  it('reads common formats and ends at the last day of the month', () => {
    expect(parseExpiry('MFG 08/2025 EXP 08/2027', today)).toEqual({ date: '2027-08-31', status: 'ok' })
    expect(parseExpiry('Exp. Date: 11-26', today)).toEqual({ date: '2026-11-30', status: 'soon' })
    expect(parseExpiry('EXP MAR.25', today)).toEqual({ date: '2025-03-31', status: 'expired' })
    expect(parseExpiry('Use before Feb 2028', today)?.date).toBe('2028-02-29')
  })

  it('counts the whole expiry month as usable', () => {
    expect(parseExpiry('EXP 10/2026', today)?.status).toBe('soon')
    expect(parseExpiry('EXP 09/2026', today)?.status).toBe('expired')
  })

  it('ignores text without an expiry label', () => {
    expect(parseExpiry('MFG 08/2025', today)).toBeUndefined()
    expect(parseExpiry('EXP 13/2027', today)).toBeUndefined()
  })
})
