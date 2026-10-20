// Deterministic report understanding (TRD §4.6): parse OCR lines, then compare each value with its range.
// No language model is involved, so this works on every device.

type Bilingual = { en: string; hi: string }

export type LabTest = {
  id: string
  canonical_name: string
  name_hi: string
  aliases: string[]
  unit: string
  /** Multiply a value in this unit (lowercase key) to get the catalogue unit. */
  units: Record<string, number>
  ranges: { sex?: 'F' | 'M'; low: number; high: number }[]
  /** Values outside this (catalogue unit) are physically implausible: almost always an OCR error. */
  plausible: [number, number]
  explain: Record<'low' | 'normal' | 'high', Bilingual>
  source: string
  reviewed: boolean
}

export type ReportField = {
  test_id: string | null
  name: string
  value: string
  unit: string
  range_low: string
  range_high: string
  uncertain: boolean
  raw: string
}

export type RangeResult =
  | { status: 'low' | 'normal' | 'high'; rangeSource: 'report' | 'catalogue'; low: number | null; high: number | null }
  | { status: 'unknown'; reason: 'value' | 'unit' }

const OCR_CONFIDENCE_FLOOR = 70
const boundary = '(?=$|[^\\p{L}\\p{N}])'
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Longest catalogue alias at the start of `text`, with its length. */
function matchAlias(cat: LabTest[], text: string): { test: LabTest; length: number } | undefined {
  const lower = text.toLowerCase().trimStart()
  const offset = text.length - text.trimStart().length
  let best: { test: LabTest; length: number } | undefined
  for (const test of cat) {
    for (const alias of test.aliases) {
      if ((!best || alias.length > best.length - offset) && new RegExp(`^${escape(alias)}${boundary}`, 'u').test(lower)) {
        best = { test, length: alias.length + offset }
      }
    }
  }
  return best
}

export const findTest = (cat: LabTest[], name: string) => matchAlias(cat, name)?.test

const rangeRe = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/
const lessRe = /<\s*=?\s*(\d+(?:\.\d+)?)/
const moreRe = />\s*=?\s*(\d+(?:\.\d+)?)/
// Value: digits, possibly with letters OCR confuses for digits (O, o, l, I, S) so they can be flagged, not silently fixed.
const valueRe = /^\s*(?:\([^)]*\))?\s*[:-]?\s*([0-9][0-9OolIS.,]*)\s*(\S*)\s*(.*)$/

export function parseReport(lines: { text: string; confidence: number }[], cat: LabTest[]): ReportField[] {
  const fields: ReportField[] = []
  for (const { text, confidence } of lines) {
    const m = matchAlias(cat, text)
    if (!m) continue
    const rest = valueRe.exec(text.slice(m.length))
    if (!rest) continue
    const [, value, unitToken, tail] = rest
    // A unit token that is actually the start of the range (e.g. "12.0") means the unit is missing.
    const unitIsRange = /^[<>\d]/.test(unitToken)
    const unit = unitIsRange ? '' : unitToken
    const rangeText = unitIsRange ? `${unitToken} ${tail}` : tail
    const r = rangeRe.exec(rangeText)
    const lt = lessRe.exec(rangeText)
    const gt = moreRe.exec(rangeText)
    const field = {
      test_id: m.test.id,
      name: text.slice(0, m.length).trim(),
      value,
      unit,
      range_low: r ? r[1] : gt ? gt[1] : '',
      range_high: r ? r[2] : lt ? lt[1] : '',
      raw: text,
    }
    fields.push({ ...field, uncertain: confidence < OCR_CONFIDENCE_FLOOR || looksWrong(m.test, field) })
  }
  return fields
}

/**
 * Catches OCR mistakes the confidence score misses, most often a lost decimal point
 * ("9.8" read as "98"). Flagged values are shown for review, never corrected silently (PRD MS-08).
 */
function looksWrong(test: LabTest, f: Omit<ReportField, 'uncertain'>): boolean {
  if (!/^\d+(\.\d+)?$/.test(f.value)) return true
  const value = Number(f.value)
  const low = f.range_low ? Number(f.range_low) : null
  const high = f.range_high ? Number(f.range_high) : null
  if (low !== null && high !== null && low >= high) return true
  if ((high !== null && value > high * 5) || (low !== null && low > 0 && value < low / 5)) return true
  const factor = test.units[f.unit.toLowerCase()]
  if (factor === undefined) return false
  const [min, max] = test.plausible
  const implausible = (n: number | null) => n !== null && (n * factor < min || n * factor > max)
  return implausible(value) || implausible(low && low > 0 ? low : null) || implausible(high)
}

export function checkRange(
  test: LabTest,
  f: Pick<ReportField, 'value' | 'unit'> & Partial<Pick<ReportField, 'range_low' | 'range_high'>>,
  sex: string | null,
): RangeResult {
  if (!/^\d+(\.\d+)?$/.test(f.value.trim())) return { status: 'unknown', reason: 'value' }
  const value = Number(f.value)
  const classify = (v: number, low: number | null, high: number | null) =>
    low !== null && v < low ? 'low' : high !== null && v > high ? 'high' : 'normal'

  const low = f.range_low ? Number(f.range_low) : null
  const high = f.range_high ? Number(f.range_high) : null
  const printedRangeValid = (low !== null || high !== null) && !Number.isNaN(low) && !Number.isNaN(high) && (low === null || high === null || low < high)
  if (printedRangeValid) return { status: classify(value, low, high), rangeSource: 'report', low, high }

  const factor = test.units[f.unit.trim().toLowerCase()]
  if (factor === undefined) return { status: 'unknown', reason: 'unit' }
  const forSex = test.ranges.filter((r) => !r.sex || r.sex === sex)
  const ranges = forSex.length ? forSex : test.ranges
  const usualLow = Math.min(...ranges.map((r) => r.low))
  const usualHigh = Math.max(...ranges.map((r) => r.high))
  return { status: classify(value * factor, usualLow, usualHigh), rangeSource: 'catalogue', low: usualLow, high: usualHigh }
}
