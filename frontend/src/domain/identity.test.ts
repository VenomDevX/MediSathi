import { describe, expect, it } from 'vitest'
import { compareIdentity, type Held, type Kyc } from './identity'

const kyc: Kyc = { abha: '00111122220001', name: 'Kamla Yadav', sex: 'F', dob: '1999-04-02' }
const held: Held = { name: 'Kamla Yadav', sex: 'F', birthDate: null, birthYear: null, ageYears: 27 }
const today = '2026-10-23'

describe('compareIdentity', () => {
  it('matches a field record with an age and a loose spelling of the name', () => {
    expect(compareIdentity(held, kyc, today)).toEqual([])
    expect(compareIdentity({ ...held, name: 'kamlaa' }, kyc, today)).toEqual([])
  })

  it('names each field that disagrees', () => {
    expect(compareIdentity({ name: 'Kamla Devi', sex: 'M', birthDate: null, birthYear: null, ageYears: 40 }, kyc, today)).toEqual(['name', 'sex', 'birth'])
  })

  it('checks a full birth date exactly, a birth year by year, and ignores what is not known', () => {
    expect(compareIdentity({ ...held, birthDate: '1999-04-03' }, kyc, today)).toEqual(['birth'])
    expect(compareIdentity({ ...held, ageYears: null, birthYear: 1999 }, kyc, today)).toEqual([])
    expect(compareIdentity({ name: 'Kamla', sex: null, birthDate: null, birthYear: null, ageYears: null }, kyc, today)).toEqual([])
  })
})
