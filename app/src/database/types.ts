export type SqlValue = string | number | null
export type Statement = { sql: string; bind?: SqlValue[] }

/** The only way the app touches SQL. Implemented by the web worker and (Phase 7) Capacitor SQLite. */
export interface Database {
  exec(sql: string): Promise<void>
  query<T = Record<string, SqlValue>>(sql: string, bind?: SqlValue[]): Promise<T[]>
  /** Runs all statements in one transaction; all or nothing. */
  batch(statements: Statement[]): Promise<void>
}
