// SQLite in a worker, persisted in OPFS (opfs-sahpool needs no COOP/COEP headers).
// Plain JS served from public/, not bundled: a bundled (Turbopack) worker reads its bootstrap config from the
// URL fragment, which is lost when the service worker serves it offline. The schema arrives in the 'init'
// message. Query semantics mirror src/database/sqlite.ts (wrapSqlite), which the unit tests exercise.
import sqlite3InitModule from './sqlite/index.mjs'

let ready

async function open(schema) {
  const sqlite3 = await sqlite3InitModule()
  let db
  let persistent = true
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'medisaathi' })
    db = new pool.OpfsSAHPoolDb('/medisaathi.sqlite3')
  } catch {
    // ponytail: in-memory fallback for browsers without OPFS; data is lost on reload, the UI warns via `persistent`.
    persistent = false
    db = new sqlite3.oo1.DB(':memory:', 'c')
  }
  db.exec(schema)
  return { db, persistent }
}

const methods = {
  exec: (db, sql) => void db.exec(sql),
  query: (db, sql, bind = []) => db.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' }),
  batch: (db, statements) => db.transaction(() => statements.forEach((s) => db.exec({ sql: s.sql, bind: s.bind ?? [] }))),
}

self.onmessage = async (e) => {
  const { id, method, args = [] } = e.data
  try {
    if (method === 'init') ready ??= open(args[0])
    const { db, persistent } = await ready
    const result = method === 'init' || method === 'status' ? { persistent } : methods[method](db, ...args)
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
