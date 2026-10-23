// ABHA number (Ayushman Bharat Health Account): 14 digits, written XX-XXXX-XXXX-XXXX.

/** The 14 digits, or null when the input is not an ABHA number. Empty input is '' (no number given). */
export function parseAbha(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '')
  if (!digits) return ''
  return /^\d{14}$/.test(digits) ? digits : null
}

export const formatAbha = (digits: string) => digits.replace(/^(\d{2})(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3-$4')
