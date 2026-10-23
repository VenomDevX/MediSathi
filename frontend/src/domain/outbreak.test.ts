import { describe, expect, it } from 'vitest'
import { detectClusters, type SymptomVisit } from './outbreak'

const now = new Date('2026-10-23T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5).toISOString()
const visit = (patient: string, village: string, days: number, symptoms: string[]): SymptomVisit => ({ patient_id: patient, village, visit_time: daysAgo(days), symptoms })

describe('detectClusters', () => {
  it('alerts when a village has 3 or more new patients with one symptom', () => {
    const visits = [1, 2, 3].map((i) => visit(`p${i}`, 'Rampur', i, ['fever']))
    expect(detectClusters(visits, now)).toEqual([{ village: 'Rampur', symptom: 'fever', cases: 3, previous: 0, alert: true }])
  })

  it('counts each patient once, however many visits', () => {
    const visits = [visit('p1', 'Rampur', 1, ['fever']), visit('p1', 'Rampur', 2, ['fever']), visit('p2', 'Rampur', 3, ['fever'])]
    expect(detectClusters(visits, now)[0]).toMatchObject({ cases: 2, alert: false })
  })

  it('needs double the previous week', () => {
    const steady = [...[1, 2, 3].map((i) => visit(`a${i}`, 'Biswan', i, ['cough'])), ...[8, 9].map((i) => visit(`b${i}`, 'Biswan', i, ['cough']))]
    expect(detectClusters(steady, now)[0]).toMatchObject({ cases: 3, previous: 2, alert: false })
    const rising = [...[1, 2, 3, 4].map((i) => visit(`a${i}`, 'Biswan', i, ['cough'])), visit('b8', 'Biswan', 8, ['cough'])]
    expect(detectClusters(rising, now)[0]).toMatchObject({ cases: 4, previous: 1, alert: true })
  })

  it('keeps villages and symptoms apart, alerts first, and ignores old, future and unknown entries', () => {
    const visits = [
      ...[1, 2, 3].map((i) => visit(`r${i}`, 'Rampur', i, ['diarrhoea'])),
      visit('s1', 'Sitapur', 1, ['diarrhoea']),
      visit('r9', 'Rampur', 1, ['fever', 'sneezing']),
      visit('old', 'Rampur', 20, ['diarrhoea']),
      visit('future', 'Rampur', -2, ['diarrhoea']),
      { ...visit('nowhere', 'x', 1, ['fever']), village: null },
    ]
    expect(detectClusters(visits, now).map((c) => `${c.village}/${c.symptom}/${c.cases}/${c.alert}`)).toEqual([
      'Rampur/diarrhoea/3/true',
      'Rampur/fever/1/false',
      'Sitapur/diarrhoea/1/false',
    ])
  })

  it('takes the window edge as inside', () => {
    expect(detectClusters([visit('p', 'Rampur', 7, ['rash'])], now)[0]?.cases).toBe(1)
    expect(detectClusters([visit('p', 'Rampur', 7.01, ['rash'])], now)).toEqual([])
  })
})
