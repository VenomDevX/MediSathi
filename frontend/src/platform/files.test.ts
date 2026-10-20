import { describe, expect, it } from 'vitest'
import { isSafeType, safeTypeFor } from './files'

describe('report file type allowlist', () => {
  it('accepts only photo and PDF types', () => {
    expect(isSafeType('image/jpeg')).toBe(true)
    expect(isSafeType('application/pdf')).toBe(true)
    expect(isSafeType('image/svg+xml')).toBe(false)
    expect(isSafeType('text/html')).toBe(false)
  })

  it('never yields a scriptable type for display, whatever the file name', () => {
    expect(safeTypeFor('report.PNG')).toBe('image/png')
    expect(safeTypeFor('report.svg')).toBeUndefined()
    expect(safeTypeFor('report.html')).toBeUndefined()
    expect(safeTypeFor('report')).toBeUndefined()
  })
})
