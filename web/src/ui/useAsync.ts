'use client'
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/app-context'
import type { Database } from '@/database/types'

/**
 * Loads data for a screen once the on-device database is ready (it seeds in the background on first run).
 * `reload()` re-runs it after a write.
 */
export function useAsync<T>(load: (db: Database) => Promise<T>, deps: unknown[]) {
  const { db, boot } = useApp()
  const ready = boot.status === 'ready'
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => load(db), [db, ...deps])
  const reload = useCallback(() => {
    if (!ready) return
    run().then(
      (data) => setState({ data, loading: false }),
      (error: Error) => setState({ error, loading: false }),
    )
  }, [run, ready])
  useEffect(reload, [reload])
  return { ...state, reload }
}
