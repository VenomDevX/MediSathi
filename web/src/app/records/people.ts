import type { StringKey } from '@/strings'

export const relations: Record<string, StringKey> = {
  self: 'relSelf', spouse: 'relSpouse', child: 'relChild', mother: 'relMother', father: 'relFather', other: 'relOther',
}
export const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
export const ageOf = (birthYear: number | null) => (birthYear ? new Date().getFullYear() - birthYear : null)
