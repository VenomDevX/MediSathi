import { describe, expect, it } from 'vitest'
import { catalogue } from './modelFiles'

describe('model catalogue', () => {
  it('uses the WebGPU builds in the browser', () => {
    expect(catalogue(false)['gemma-4-e2b'].file).toBe('gemma-4-E2B-it-web.litertlm')
    expect(catalogue(false)['gemma-3n-e2b'].file).toBe('gemma-3n-E2B-it-int4-Web.litertlm')
  })

  it('uses the CPU+GPU builds on Android, with matching sizes and download link', () => {
    const android = catalogue(true)
    expect(android['gemma-4-e2b']).toMatchObject({ file: 'gemma-4-E2B-it.litertlm', bytes: 2_588_147_712 })
    expect(android['gemma-4-e2b'].url).toMatch(/\/gemma-4-E2B-it\.litertlm$/)
    expect(android['gemma-3n-e2b']).toMatchObject({ file: 'gemma-3n-E2B-it-int4.litertlm', bytes: 3_655_827_456, url: undefined })
  })
})
