import { useCallback, useEffect, useState } from 'react'

/** Loads async data for a screen; `reload()` re-runs it after a write. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true })
  const run = useCallback(load, deps)
  const reload = useCallback(() => {
    run().then(
      (data) => setState({ data, loading: false }),
      (error: Error) => setState({ error, loading: false }),
    )
  }, [run])
  useEffect(reload, [reload])
  return { ...state, reload }
}
