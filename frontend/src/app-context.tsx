import { createContext, useContext } from 'react'
import type { Database } from './database/types'

export type User = { id: string; display_name: string; role: string; assigned_scope: string[] }
export type StorageState = 'persistent' | 'best-effort' | 'memory'

export type Boot = { db: Database; storage: StorageState; online: boolean; user: User | null; setUserId: (id: string | null) => Promise<void> }
type AppState = Boot & { user: User }

export const AppContext = createContext<Boot | null>(null)

export async function loadUser(database: Database, id: string): Promise<User | null> {
  const [u] = await database.query<{ id: string; display_name: string; role: string; assigned_scope_json: string }>(
    'SELECT id, display_name, role, assigned_scope_json FROM users WHERE id = ?',
    [id],
  )
  return u ? { id: u.id, display_name: u.display_name, role: u.role, assigned_scope: JSON.parse(u.assigned_scope_json) } : null
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
