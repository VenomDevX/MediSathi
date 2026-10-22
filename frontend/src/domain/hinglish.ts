// Hinglish spelling folding. People type (and voice input writes) the same Hindi word many ways: bukhar, bukhaar,
// bukar; saanp, sanp, saap; khansi, khaansi; nahi, nahin. Folding both the question and the library keywords to one
// key lets them meet. Devanagari gets the same treatment for nukta and chandrabindu (ज़/ज, साँप/सांप).
// ponytail: hand rules for the common spelling swaps, not a transliterator; add one if users write fully in Roman.

/** One spelling key for a single word. Words that are already plain stay as they are. */
export function fold(word: string): string {
  const w = word.toLowerCase()
  if (!/^[a-z]+$/.test(w)) return w.replace(/़/g, '').replace(/ँ/g, 'ं')
  return w
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/z/g, 'j')
    .replace(/w/g, 'v')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/([bcdgjklpstv])h/g, '$1') // kh→k, bh→b, chh→c, sh→s: aspiration is often left out
    .replace(/(.)\1+/g, '$1') // aa→a, kk→k
    .replace(/[nm](?=[bdgjkpst])/g, '') // nasal before a consonant: saanp/saamp→sap, khansi→kasi
    .replace(/(?<=\w{2}[aeiou])n$/, '') // final nasal: nahin→nahi, hain→hai
    .replace(/y$/, 'i') // ulty→ulti
}

/** Folds every word in a phrase, keeping spaces and punctuation. */
export const foldText = (text: string) => text.replace(/[\p{L}\p{M}]+/gu, fold)

/** The words plus their folded forms, without repeats: what a search should look for. */
export const withFolded = (words: string[]) => [...new Set(words.flatMap((w) => [w, fold(w)]))]
