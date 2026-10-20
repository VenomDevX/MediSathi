// Checks a model's answer before it is kept. Any failure means the app shows the library's own words instead.
// Deliberately strict: a medical answer may only repeat numbers and medicines that its sources contain.

export type Check = { ok: true } | { ok: false; reason: 'no-answer' | 'no-citation' | 'bad-citation' | 'new-number' | 'medicine' }

const DEVANAGARI_DIGITS = /[०-९]/g
const toAscii = (s: string) => s.replace(DEVANAGARI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966))
const numbersIn = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? []

// ponytail: a fixed list of common Indian OTC names; widen it (or move it to content/) as the library grows.
const MEDICINES = [
  'paracetamol', 'crocin', 'dolo', 'calpol', 'ibuprofen', 'brufen', 'aspirin', 'disprin', 'antibiotic', 'amoxicillin', 'azithromycin',
  'cetirizine', 'mg', 'milligram', 'पैरासिटामोल', 'क्रोसिन', 'डोलो', 'आइबुप्रोफेन', 'एस्पिरिन', 'एंटीबायोटिक', 'मिलीग्राम',
]
const word = (w: string) => new RegExp(`(?<![\\p{L}\\p{M}])${w}(?![\\p{L}\\p{M}])`, 'iu')

/**
 * @param partial true while the answer is still streaming: citations are not required yet, and a number at the
 * very end is allowed while it could still become a number the sources contain ("2" on the way to "20").
 */
export function checkAnswer(answer: string, sources: string[], { partial = false } = {}): Check {
  // While streaming, a citation can arrive in pieces ("[1" before "]"): drop the unfinished tail.
  const ascii = toAscii(answer)
  const text = partial ? ascii.replace(/\[\d*$/, '') : ascii
  if (/NO_ANSWER/.test(text)) return { ok: false, reason: 'no-answer' }

  const cited = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
  if (cited.some((n) => n < 1 || n > sources.length)) return { ok: false, reason: 'bad-citation' }
  if (!partial && cited.length === 0) return { ok: false, reason: 'no-citation' }

  const source = toAscii(sources.join('\n'))
  const allowed = new Set(numbersIn(source))
  let body = text.replace(/\[\d+\]/g, ' ')
  if (partial) body = body.replace(/(\d)\.$/, '$1') // "9." may be on its way to "9.8"
  const nums = numbersIn(body)
  const trailing = partial && /\d$/.test(body) ? nums.pop() : undefined
  if (nums.some((n) => !allowed.has(n))) return { ok: false, reason: 'new-number' }
  if (trailing && ![...allowed].some((n) => n.startsWith(trailing))) return { ok: false, reason: 'new-number' }

  const lowerSource = source.toLowerCase()
  if (MEDICINES.some((m) => word(m).test(body) && !word(m).test(lowerSource))) return { ok: false, reason: 'medicine' }
  return { ok: true }
}
