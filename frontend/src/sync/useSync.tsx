import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app-context'
import { setPin, storeSecret } from '../auth/pin'
import { createApi, logout } from './api'
import { AuthError, runSync, type SyncSummary } from './engine'

export type Session = { pin: string; refreshToken: string | null }
type SyncState = {
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

const SyncContext = createContext<SyncState | null>(null)
const INTERVAL_MS = 60_000

/** Runs sync on unlock, when the network returns, when the app comes back to the foreground, and every minute (TRD §8.1). */
export function SyncProvider({ session, onSignOut, children }: { session: Session; onSignOut: () => void; children: ReactNode }) {
  const { db, user, online, setUserId } = useApp()
  const [state, setState] = useState<Omit<SyncState, 'syncNow' | 'signOut' | 'canSync' | 'changePin'>>({ syncing: false, last: null, error: null, pending: 0 })
  const running = useRef(false)
  const refresh = useRef(session.refreshToken)
  const pin = useRef(session.pin) // changes with changePin; token rotations are wrapped under the current one
  const canSync = !!session.refreshToken

  const countPending = useCallback(async () => {
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*) AS n FROM sync_operations WHERE status IN ('pending', 'failed', 'conflict')")
    setState((s) => ({ ...s, pending: n }))
  }, [db])

  const syncNow = useCallback(async () => {
    if (!refresh.current || running.current) return countPending()
    running.current = true
    setState((s) => ({ ...s, syncing: true }))
    try {
      const api = createApi(refresh.current, async (token) => {
        refresh.current = token
        await storeSecret(db, user.id, pin.current, token)
      })
      const summary = await runSync(db, api, user.id)
      setState((s) => ({ ...s, error: null, last: summary.offline ? s.last : { at: new Date().toISOString(), summary } }))
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof AuthError ? 'auth' : 'failed' }))
    } finally {
      running.current = false
      setState((s) => ({ ...s, syncing: false }))
      await countPending()
    }
  }, [db, user.id, countPending])

  useEffect(() => {
    void syncNow()
    const id = setInterval(() => void syncNow(), INTERVAL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void syncNow()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncNow])

  useEffect(() => {
    if (online) void syncNow()
  }, [online, syncNow])

  async function changePin(next: string) {
    await setPin(db, user.id, next, refresh.current ?? undefined)
    pin.current = next
  }

  async function signOut() {
    if (refresh.current) await logout(refresh.current)
    await db.batch([{ sql: 'UPDATE users SET wrapped_secret = NULL WHERE id = ?', bind: [user.id] }])
    await setUserId(null)
    onSignOut()
  }

  return <SyncContext.Provider value={{ ...state, canSync, syncNow, signOut, changePin }}>{children}</SyncContext.Provider>
}

export function useSync() {
  const s = useContext(SyncContext)
  if (!s) throw new Error('useSync outside SyncProvider')
  return s
}
