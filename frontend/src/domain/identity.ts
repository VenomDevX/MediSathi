// Compares what we hold about a person with the identity DigiLocker returns for their ABHA number.
// Field records are rough (an age instead of a birth date, a first name only), so the check is forgiving where they are.
import { fold } from './hinglish'

export type Kyc = { abha: string; name: string; sex: 'F' | 'M' | 'O'; dob: string }
export type Held = { name: string; sex: string | null; birthDate: string | null; birthYear: number | null; ageYears: number | null }
export type Mismatch = 'name' | 'sex' | 'birth'

const words = (s: string) => s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).map(fold)

/** Fields that disagree; an empty list means the person matches. Unknown fields are not held against them. */
export function compareIdentity(held: Held, kyc: Kyc, today: string): Mismatch[] {
  const out: Mismatch[] = []
  const known = new Set(words(kyc.name))
  const ours = words(held.name)
  // "Kamla" matches "Kamla Yadav"; "Kamla Devi" does not.
  if (!ours.length || !ours.every((w) => known.has(w))) out.push('name')
  if (held.sex && held.sex !== kyc.sex) out.push('sex')
  const year = Number(kyc.dob.slice(0, 4))
  if (held.birthDate) {
    if (held.birthDate !== kyc.dob) out.push('birth')
  } else if (held.birthYear != null) {
    if (held.birthYear !== year) out.push('birth')
  } else if (held.ageYears != null) {
    // An age was asked, not a birth date: allow the year either side of the birthday.
    const age = Number(today.slice(0, 4)) - year
    if (Math.abs(held.ageYears - age) > 1) out.push('birth')
  }
  return out
}
