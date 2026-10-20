import { createContext, useContext } from 'react'
import type { SyncSummary } from './engine'

export type Session = { pin: string; refreshToken: string | null }
export type SyncState = {
  canSync: boolean
  syncing: boolean
  last: { at: string; summary: SyncSummary } | null
  error: 'auth' | 'failed' | null
  pending: number
  syncNow: () => Promise<void>
  signOut: () => Promise<void>
  /** Sets a new PIN, keeping a signed-in account's refresh token wrapped under it. */
  changePin: (pin: string) => Promise<void>
}

export const SyncContext = createContext<SyncState | null>(null)
export function useSync() {
  const s = useContext(SyncContext)
  if (!s) throw new Error('useSync outside SyncProvider')
  return s
}
