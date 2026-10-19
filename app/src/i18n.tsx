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

/** t('key') or t('key', { n: 3 }) → replaces {n}. */
export function useT() {
  const { lang } = useLang()
  return (key: StringKey, vars?: Record<string, string | number>) => {
    let s: string = strings[key][lang]
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v))
    return s
  }
}
