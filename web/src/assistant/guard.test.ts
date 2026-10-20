import { describe, expect, it } from 'vitest'
import { checkAnswer } from './guard'

const sources = ['Cool the burn under running water for 20 minutes.\nCheck the temperature every 4 to 6 hours.']

describe('checkAnswer', () => {
  it('accepts a cited answer that only uses numbers from the sources', () => {
    const r = checkAnswer('* Cool it under water for 20 minutes. [1]\n* Check every 4 to 6 hours. [1]', sources)
    expect(r).toEqual({ ok: true })
  })

  it('accepts Devanagari digits that match the sources', () => {
    expect(checkAnswer('२० मिनट तक पानी डालें। [1]', sources)).toEqual({ ok: true })
  })

  it('treats NO_ANSWER as "not covered", even with stray text', () => {
    expect(checkAnswer('NO_ANSWER [1]', sources)).toEqual({ ok: false, reason: 'no-answer' })
  })

  it('rejects an answer without citations', () => {
    expect(checkAnswer('Cool it under water.', sources)).toEqual({ ok: false, reason: 'no-citation' })
  })

  it('rejects citations to sources that do not exist', () => {
    expect(checkAnswer('Cool it under water. [3]', sources)).toEqual({ ok: false, reason: 'bad-citation' })
  })

  it('rejects numbers the sources do not contain, such as a dose', () => {
    expect(checkAnswer('Give 500 mg twice a day. [1]', sources)).toEqual({ ok: false, reason: 'new-number' })
    expect(checkAnswer('२ गोली दें। [1]', sources)).toEqual({ ok: false, reason: 'new-number' })
  })

  it('rejects medicine names the sources do not mention', () => {
    expect(checkAnswer('Give paracetamol. [1]', sources)).toEqual({ ok: false, reason: 'medicine' })
    expect(checkAnswer('पैरासिटामोल दें। [1]', sources)).toEqual({ ok: false, reason: 'medicine' })
  })

  it('can check a partial stream, failing as soon as a bad number appears', () => {
    expect(checkAnswer('Give 500', sources, { partial: true })).toEqual({ ok: false, reason: 'new-number' })
    expect(checkAnswer('Cool it under', sources, { partial: true })).toEqual({ ok: true })
    expect(checkAnswer('Cool it under water. [1', sources, { partial: true })).toEqual({ ok: true }) // citation still arriving
    expect(checkAnswer('पानी डालें। [१', sources, { partial: true })).toEqual({ ok: true })
  })
})
