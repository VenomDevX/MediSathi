// Deterministic red-flag detection (PRD HG-06, TRD §11). Runs before any search result or model call.

export type EmergencyRule = {
  id: string
  /** Every group must match; within a group any one term is enough. */
  all: string[][]
  title: Record<string, string>
  instruction: Record<string, string>
}

/** Returns the text in the requested language, falling back to en or hi when not translated. */
export function ruleText(text: Record<string, string>, lang: string): string {
  return text[lang] ?? (lang === 'hi' ? text.hi : text.en) ?? text.en ?? text.hi ?? ''
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Whole-word match. A trailing Devanagari vowel sign is allowed so "काट" also matches "काटा".
const termRe = (term: string) => new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${escape(term.toLowerCase())}(?![\\p{L}\\p{N}])`, 'u')

export function matchEmergency(rules: EmergencyRule[], query: string): EmergencyRule | undefined {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!q) return undefined
  return rules.find((rule) => rule.all.every((group) => group.some((term) => termRe(term).test(q))))
}
