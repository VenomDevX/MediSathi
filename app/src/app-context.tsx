import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { db, dbStatus } from './database/db'
import { seedIfNeeded } from './database/seed'
import { content } from './content'
import type { Database } from './database/types'

export type User = { id: string; display_name: string; role: string; assigned_scope: string[] }
export type StorageState = 'persistent' | 'best-effort' | 'memory'

type AppState = { db: Database; user: User; storage: StorageState; online: boolean }
type Boot = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & AppState)

const AppContext = createContext<AppState | null>(null)

async function boot(): Promise<Omit<AppState, 'online'>> {
  const [{ persistent }, granted] = await Promise.all([
    dbStatus(),
    navigator.storage?.persist?.().catch(() => false) ?? Promise.resolve(false),
  ])
  await seedIfNeeded(db, content)
  // Phase 6 replaces this with the signed-in user; until then the first seeded worker is used.
  const [u] = await db.query<{ id: string; display_name: string; role: string; assigned_scope_json: string }>(
    "SELECT id, display_name, role, assigned_scope_json FROM users WHERE role = 'asha_worker' ORDER BY id LIMIT 1",
  )
  return {
    db,
    user: { id: u.id, display_name: u.display_name, role: u.role, assigned_scope: JSON.parse(u.assigned_scope_json) },
    storage: !persistent ? 'memory' : granted ? 'persistent' : 'best-effort',
  }
}

export function AppProvider({ children, loading, error }: { children: ReactNode; loading: ReactNode; error: ReactNode }) {
  const [state, setState] = useState<Boot>({ status: 'loading' })
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    boot().then(
      (s) => setState({ status: 'ready', ...s, online }),
      () => setState({ status: 'error' }),
    )
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.status === 'loading') return loading
  if (state.status === 'error') return error
  return <AppContext.Provider value={{ ...state, online }}>{children}</AppContext.Provider>
}

export function useApp() {
  const s = useContext(AppContext)
  if (!s) throw new Error('useApp outside AppProvider')
  return s
}
