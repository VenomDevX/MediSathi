// Reads a photo of a medicine strip (text from on-device OCR): which medicine it is and whether it has expired.
// Demo catalogue, not clinically reviewed (content/medicines.json).

export type Medicine = {
  id: string
  generic: string
  /** Lower-case generic and brand names; a name may have more than one word ("iron folic acid"). */
  names: string[]
  use: Record<string, string>
  warning: Record<string, string>
}

export type Expiry = { date: string; status: 'expired' | 'soon' | 'ok' }

// OCR often reads O as 0, l as 1 and S as 5 inside words ("D0LO"); fixed only in tokens that also have letters.
const fixOcr = (tok: string) => (/[a-z]/.test(tok) ? tok.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's') : tok)
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(fixOcr)

/** True when a and b differ by at most one inserted, removed or changed letter. */
function nearlySame(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] !== b[j] && ++edits > 1) return false
    if (a[i] === b[j] || a.length === b.length) {
      i++
      j++
    } else if (a.length > b.length) i++
    else j++
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/**
 * The medicine whose name appears in the text. Exact words win over near matches; near matches (one OCR slip)
 * count only for names of 5 letters or more, so short brands like "pan" never match by accident.
 */
export function identifyMedicine(text: string, catalogue: Medicine[]): Medicine | undefined {
  const toks = words(text)
  const joined = ` ${toks.join(' ')} `
  const exact = catalogue.find((m) => m.names.some((n) => joined.includes(` ${n} `)))
  if (exact) return exact
  return catalogue.find((m) => m.names.some((n) => !n.includes(' ') && n.length >= 5 && toks.some((t) => nearlySame(t, n))))
}

/** The strength printed on the strip, e.g. "650 mg". */
export function strength(text: string): string | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu)\b/i.exec(text)
  return m ? `${m[1]} ${m[2].toLowerCase()}` : undefined
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const EXPIRY = /(?:exp(?:iry)?|use\s*before|best\s*before)\b\.?\s*(?:date)?\s*[:.-]?\s*([a-z]{3}|\d{1,2})[\s./-]*(\d{4}|\d{2})\b/i
const SOON_DAYS = 90

/** Expiry from "EXP 08/2027", "Exp. Date: 08-27", "EXP MAR.25", "Use before Jan 2026". Strips expire at the end of the month. */
export function parseExpiry(text: string, today: Date): Expiry | undefined {
  const m = EXPIRY.exec(text.replace(/[O0](?=\d)/g, '0'))
  if (!m) return undefined
  const month = /\d/.test(m[1]) ? Number(m[1]) : MONTHS.indexOf(m[1].toLowerCase().replace('0', 'o')) + 1
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  if (month < 1 || month > 12) return undefined
  const end = new Date(Date.UTC(year, month, 0)) // day 0 of the next month: the last day of this one
  const days = (end.getTime() - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5
  return { date: end.toISOString().slice(0, 10), status: days < 0 ? 'expired' : days < SOON_DAYS ? 'soon' : 'ok' }
}
