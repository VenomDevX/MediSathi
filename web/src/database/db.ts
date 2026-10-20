import { schema } from './schema'
import type { Database } from './types'

let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function call<T>(method: string, args: unknown[] = []): Promise<T> {
  if (!worker) {
    // public/db-worker.mjs (see its header for why it is not bundled). 'init' is always the first message.
    worker = new Worker('/db-worker.mjs', { type: 'module' })
    worker.postMessage({ id: nextId++, method: 'init', args: [schema] })
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.error !== undefined) p.reject(new Error(e.data.error))
      else p.resolve(e.data.result)
    }
  }
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker!.postMessage({ id, method, args })
  })
}

/** Browser database: SQLite WASM in a worker, persisted in OPFS. */
export const db: Database = {
  exec: (sql) => call('exec', [sql]),
  query: (sql, bind) => call('query', [sql, bind]),
  batch: (statements) => call('batch', [statements]),
}

export const dbStatus = () => call<{ persistent: boolean }>('status')
