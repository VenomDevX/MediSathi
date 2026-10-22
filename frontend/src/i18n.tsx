import { createContext, useCallback, useContext } from 'react'
import { strings, type StringKey } from './strings'

export type Lang = 'hi' | 'en' | 'ta' | 'te' | 'bn' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa' | 'or' | 'as' | 'ur'

/** Metadata for each supported language: BCP-47 locale, native label, and script name for the AI prompt. */
export const LANG_META: Record<Lang, { locale: string; label: string; script: string }> = {
  hi: { locale: 'hi-IN', label: 'हिंदी', script: 'Hindi (Devanagari script)' },
  en: { locale: 'en-IN', label: 'English', script: 'English' },
  ta: { locale: 'ta-IN', label: 'தமிழ்', script: 'Tamil (Tamil script)' },
  te: { locale: 'te-IN', label: 'తెలుగు', script: 'Telugu (Telugu script)' },
  bn: { locale: 'bn-IN', label: 'বাংলা', script: 'Bengali (Bengali script)' },
  mr: { locale: 'mr-IN', label: 'मराठी', script: 'Marathi (Devanagari script)' },
  gu: { locale: 'gu-IN', label: 'ગુજરાતી', script: 'Gujarati (Gujarati script)' },
  kn: { locale: 'kn-IN', label: 'ಕನ್ನಡ', script: 'Kannada (Kannada script)' },
  ml: { locale: 'ml-IN', label: 'മലയാളം', script: 'Malayalam (Malayalam script)' },
  pa: { locale: 'pa-IN', label: 'ਪੰਜਾਬੀ', script: 'Punjabi (Gurmukhi script)' },
  or: { locale: 'or-IN', label: 'ଓଡ଼ିଆ', script: 'Odia (Odia script)' },
  as: { locale: 'as-IN', label: 'অসমীয়া', script: 'Assamese (Bengali script)' },
  ur: { locale: 'ur-IN', label: 'اردو', script: 'Urdu (Nastaliq script)' },
}

export const ALL_LANGS: Lang[] = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur']

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} })

export const useLang = () => useContext(LangContext)

/** Formats an ISO date or datetime for the current language, e.g. "19 अक्टू॰ 2026". */
export function useFormatDate() {
  const { lang } = useLang()
  const locale = LANG_META[lang].locale
  return (iso: string, withTime = false) =>
    new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    })
}

/** t('key') or t('key', { n: 3 }) → replaces {n}. Falls back en → hi when the key is not translated yet. */
export function useT() {
  const { lang } = useLang()
  return useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      const entry = strings[key] as Record<string, string>
      let s: string = entry[lang] ?? entry['en'] ?? entry['hi']
      for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v))
      return s
    },
    [lang],
  )
}
