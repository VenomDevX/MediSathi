'use client'
import { useEffect, useState } from 'react'
import { db, dbStatus } from '@/database/db'
import { seedIfNeeded } from '@/database/seed'
import { content } from '@/content'

// Phase 1 smoke page: proves SQLite WASM + OPFS + Hindi FTS run in the browser. Replaced in Phase 2.
export default function Page() {
  const [out, setOut] = useState('loading')
  useEffect(() => {
    ;(async () => {
      await seedIfNeeded(db, content)
      const { persistent } = await dbStatus()
      const rows = await db.query<{ id: string }>("SELECT id FROM guidance_fts WHERE guidance_fts MATCH 'बुखार'")
      setOut(`persistent=${persistent} fts=${rows.map((r) => r.id).join(',')}`)
    })().catch((e) => setOut(`error: ${e}`))
  }, [])
  return <main data-testid="smoke">{out}</main>
}
