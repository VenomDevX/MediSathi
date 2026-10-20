import type { Database as Oo1Db } from '@sqlite.org/sqlite-wasm'
import type { Database, SqlValue, Statement } from './types'

/** Adapts a synchronous sqlite-wasm oo1 DB (worker or Node tests) to the async Database interface. */
export function wrapSqlite(db: Oo1Db): Database {
  return {
    async exec(sql) {
      db.exec(sql)
    },
    async query<T>(sql: string, bind: SqlValue[] = []) {
      return db.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' }) as T[]
    },
    async batch(statements: Statement[]) {
      db.transaction(() => {
        for (const s of statements) db.exec({ sql: s.sql, bind: s.bind ?? [] })
      })
    },
  }
}
