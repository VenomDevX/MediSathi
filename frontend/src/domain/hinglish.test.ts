import { beforeAll, describe, expect, it } from 'vitest'
import guidance from '../../../content/guidance.json'
import rules from '../../../content/emergency_rules.json'
import { retrieve } from '../assistant/answer'
import { searchGuidance } from '../data/guidance'
import { seedIfNeeded, type SeedContent } from '../database/seed'
import { openTestDb } from '../database/testDb'
import type { Database } from '../database/types'
import { matchEmergency, type EmergencyRule } from './emergency'
import { fold } from './hinglish'

const emergency = rules as EmergencyRule[]
let db: Database
beforeAll(async () => {
  db = await openTestDb()
  await seedIfNeeded(db, { version: 't', guidance, labCatalogue: [], donors: [] } as unknown as SeedContent)
})

describe('Hinglish spelling folding', () => {
  it('gives common spellings of one word the same key', () => {
    const same = [
      ['bukhar', 'bukhaar', 'bukar'],
      ['saanp', 'sanp', 'saap', 'saamp'],
      ['khansi', 'khaansi', 'khasi'],
      ['nahi', 'nahin', 'nahee'],
      ['ulti', 'ultee', 'ulty'],
      ['dhoop', 'dhup'],
      ['zukaam', 'jukam', 'jukham'],
      ['khoon', 'khun'],
    ]
    for (const spellings of same) expect(new Set(spellings.map(fold)).size, spellings.join('/')).toBe(1)
  })

  it('treats Devanagari nukta and chandrabindu spellings alike', () => {
    expect(fold('ज़हर')).toBe(fold('जहर'))
    expect(fold('साँप')).toBe(fold('सांप'))
  })

  it('keeps different words apart', () => {
    expect(fold('bukhar')).not.toBe(fold('khansi'))
    expect(fold('dast')).not.toBe(fold('daura'))
  })
})

describe('Hinglish questions', () => {
  it('flags emergencies whatever the spelling', () => {
    expect(matchEmergency(emergency, 'saamp ne kaata')?.id).toBe('snake-bite')
    expect(matchEmergency(emergency, 'baby sans nahin le raha')?.id).toBe('not-breathing')
    expect(matchEmergency(emergency, 'usne zeher kha liya')?.id).toBe('poisoning')
    expect(matchEmergency(emergency, 'papa ko heart attack aaya')?.id).toBe('chest-pain')
    expect(matchEmergency(emergency, 'स्नेक बाइट हुआ है')?.id).toBe('snake-bite')
  })

  it('finds the library topic for loose spellings and English words heard in Hindi', async () => {
    expect((await retrieve(db, 'bacche ko bukhaar hai', 'en'))[0]?.topic).toBe('fever')
    expect((await retrieve(db, 'pet kharab hai aur ultee', 'en'))[0]?.topic).toBe('diarrhoea')
    expect((await retrieve(db, 'dhup me lu lag gayi', 'en'))[0]?.topic).toBe('heat-stroke')
    expect((await retrieve(db, 'बच्चे को फीवर है', 'hi'))[0]?.topic).toBe('fever')
  })

  it('searches the guidance list with loose spellings', async () => {
    expect((await searchGuidance(db, 'bukhaar', 'en'))[0]?.topic).toBe('fever')
    expect((await searchGuidance(db, 'chakar', 'en'))[0]?.topic).toBe('fainting')
  })
})
