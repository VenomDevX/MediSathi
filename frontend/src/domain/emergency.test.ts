import { describe, expect, it } from 'vitest'
import rules from '../../../content/emergency_rules.json'
import { matchEmergency, type EmergencyRule } from './emergency'

const r = rules as EmergencyRule[]
const id = (q: string) => matchEmergency(r, q)?.id ?? null

describe('matchEmergency', () => {
  it('detects red flags in English, Hindi and Hinglish', () => {
    expect(id('my father has chest pain')).toBe('chest-pain')
    expect(id('सीने में दर्द हो रहा है')).toBe('chest-pain')
    expect(id('baccha behosh ho gaya')).toBe('unconscious')
    expect(id('Not Breathing')).toBe('not-breathing')
  })

  it('needs every group of a multi-part rule', () => {
    expect(id('snake bite')).toBe('snake-bite')
    expect(id('saanp ne kata')).toBe('snake-bite')
    expect(id('सांप ने काटा')).toBe('snake-bite')
    expect(id('saw a snake in the field')).toBeNull()
    expect(id('pregnant woman with bleeding')).toBe('pregnancy-bleeding')
    expect(id('pregnancy diet')).toBeNull()
  })

  it('does not escalate ordinary questions', () => {
    for (const q of ['fever', 'बुखार', 'small burn on finger', 'diarrhoea in child', 'dog bite', '']) expect(id(q)).toBeNull()
  })

  it('matches whole words so similar words do not trigger', () => {
    expect(id('profits')).toBeNull()
    expect(id('choker necklace')).toBeNull()
  })
})
