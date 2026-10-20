'use client'
import type { ReactNode } from 'react'
import { AppProvider } from '@/app-context'
import { LangProvider } from '@/i18n'
import { Shell } from './Shell'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <AppProvider>
        <Shell>{children}</Shell>
      </AppProvider>
    </LangProvider>
  )
}
