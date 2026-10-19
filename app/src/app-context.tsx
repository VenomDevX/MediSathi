import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { db, dbStatus } from './database/db'
import { seedIfNeeded } from './database/seed'
import { content } from './content'
import { Capacitor } from '@capacitor/core'
import { watchOnline } from './platform/network'
import type { Database } from './database/types'

export type User = { id: string; display_name: string; role: string; assigned_scope: string[] }
export type StorageState = 'persistent' | 'best-effort' | 'memory'

type Boot = { db: Database; storage: StorageState; online: boolean; user: User | null; setUserId: (id: string | null) => Promise<void> }
type AppState = Boot & { user: User }

const AppContext = createContext<Boot | null>(null)

export async function loadUser(database: Database, id: string): Promise<User | null> {
  const [u] = await database.query<{ id: string; display_name: string; role: string; assigned_scope_json: string }>(
    'SELECT id, display_name, role, assigned_scope_json FROM users WHERE id = ?',
    [id],
  )
  return u ? { id: u.id, display_name: u.display_name, role: u.role, assigned_scope: JSON.parse(u.assigned_scope_json) } : null
}

async function boot() {
  const [{ persistent }, granted] = await Promise.all([dbStatus(), navigator.storage?.persist?.().catch(() => false) ?? Promise.resolve(false)])
  await seedIfNeeded(db, content)
  const [meta] = await db.query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'current_user_id'")
  return {
    // The Android app's storage is only cleared by uninstall or 'clear data', never evicted like a browser's.
    storage: (!persistent ? 'memory' : granted || Capacitor.isNativePlatform() ? 'persistent' : 'best-effort') as StorageState,
    user: meta ? await loadUser(db, meta.value) : null,
  }
}

export function AppProvider({ children, loading, error }: { children: ReactNode; loading: ReactNode; error: ReactNode }) {
  const [state, setState] = useState<{ status: 'loading' | 'error' } | { status: 'ready'; storage: StorageState; user: User | null }>({ status: 'loading' })
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    boot().then(
      (s) => setState({ status: 'ready', ...s }),
      () => setState({ status: 'error' }),
    )
    return watchOnline(setOnline)
  }, [])

  if (state.status === 'loading') return loading
  if (state.status === 'error') return error
  const ready = state as Extract<typeof state, { status: 'ready' }>

  async function setUserId(id: string | null) {
    await db.batch([id ? { sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('current_user_id', ?)", bind: [id] } : { sql: "DELETE FROM app_meta WHERE key = 'current_user_id'" }])
    const user = id ? await loadUser(db, id) : null
    setState((s) => ({ ...(s as { status: 'ready'; storage: StorageState }), user }))
  }

  return <AppContext.Provider value={{ db, storage: ready.storage, online, user: ready.user, setUserId }}>{children}</AppContext.Provider>
}

/** App state before sign-in (user may be null). Only the sign-in and lock screens need this. */
export function useBoot() {
  const s = useContext(AppContext)
  if (!s) throw new Error('useBoot outside AppProvider')
  return s
}

/** App state for screens behind the lock: a user is always signed in here. */
export function useApp(): AppState {
  const s = useBoot()
  if (!s.user) throw new Error('useApp before sign-in')
  return s as AppState
}
