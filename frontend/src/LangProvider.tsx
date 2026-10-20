import { useEffect, useState, type ReactNode } from 'react'
import { LangContext, type Lang } from './i18n'

function readLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'hi' ? 'hi' : 'en'
  } catch {
    return 'en'
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
