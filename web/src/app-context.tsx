'use client'
import { Capacitor } from '@capacitor/core'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { content } from './content'
import { db, dbStatus } from './database/db'
import { seedIfNeeded } from './database/seed'
import type { Database } from './database/types'
import { watchOnline } from './platform/network'

export type Boot = { status: 'loading' } | { status: 'error' } | { status: 'ready'; persistent: boolean }
type AppState = { db: Database; boot: Boot; online: boolean }

const AppContext = createContext<AppState | null>(null)

/** Opens the on-device database. Nothing blocks rendering: emergency numbers must show even if this fails. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' })
  const [online, setOnline] = useState(true)

  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => false)
    seedIfNeeded(db, content)
      .then(() => dbStatus())
      .then(({ persistent }) => setBoot({ status: 'ready', persistent }), () => setBoot({ status: 'error' }))
    setOnline(navigator.onLine)
    return watchOnline(setOnline)
  }, [])

  useEffect(() => {
    // Offline after the first visit. Not in the Android app: its files are already on the device.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator && !Capacitor.isNativePlatform())
      navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return <AppContext.Provider value={{ db, boot, online }}>{children}</AppContext.Provider>
}

export function useApp() {
  const s = useContext(AppContext)
  if (!s) throw new Error('useApp outside AppProvider')
  return s
}
