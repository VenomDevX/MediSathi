import { useEffect, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { AppContext, loadUser, type StorageState, type User } from './app-context'
import { resetBuiltInDemoPins } from './auth/pin'
import { content } from './content'
import { db, dbStatus } from './database/db'
import { seedIfNeeded } from './database/seed'
import { watchOnline } from './platform/network'

async function boot() {
  const [{ persistent }, granted] = await Promise.all([dbStatus(), navigator.storage?.persist?.().catch(() => false) ?? Promise.resolve(false)])
  await seedIfNeeded(db, content)
  await resetBuiltInDemoPins(db)
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
