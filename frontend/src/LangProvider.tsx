import { useEffect, useState, type ReactNode } from 'react'
import { ALL_LANGS, LangContext, type Lang } from './i18n'

function readLang(): Lang {
  try {
    const stored = localStorage.getItem('lang') as Lang | null
    return stored && ALL_LANGS.includes(stored) ? stored : 'en'
  } catch {
    return 'en'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
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

