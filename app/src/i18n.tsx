import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { strings, type StringKey } from './strings'

export type Lang = 'hi' | 'en'

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'hi', setLang: () => {} })

function readLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'hi'
  } catch {
    return 'hi'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('lang', l)
    } catch {
      /* private mode: language just won't be remembered */
    }
  }
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)

/** Formats an ISO date or datetime for the current language, e.g. "19 अक्टू॰ 2026". */
export function useFormatDate() {
  const { lang } = useLang()
  return (iso: string, withTime = false) =>
    new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    })
}

/** t('key') or t('key', { n: 3 }) → replaces {n}. */
export function useT() {
  const { lang } = useLang()
  return (key: StringKey, vars?: Record<string, string | number>) => {
    let s: string = strings[key][lang]
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v))
    return s
  }
}
