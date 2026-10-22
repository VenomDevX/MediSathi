import type { Database } from '../database/types'
import { withFolded } from '../domain/hinglish'

export type Guidance = {
  id: string
  title: string
  language: 'hi' | 'en'
  topic: string
  category: string
  summary: string
  content: string
  source_name: string
  source_reference: string | null
  reviewed: number
  reviewed_at: string | null
  limitations: string
  audience: string
  version: string
}

const cols = 'g.id, g.title, g.language, g.topic, g.category, g.summary, g.content, g.source_name, g.source_reference, g.reviewed, g.reviewed_at, g.limitations, g.audience, g.version'

/**
 * Offline full-text search (TRD §4.5). Each word becomes a quoted prefix term, so user input
 * can never be read as FTS syntax. Items in the reader's language come first.
 */
export async function searchGuidance(db: Database, query: string, lang: string): Promise<Guidance[]> {
  const docLang = lang === 'hi' ? 'hi' : 'en'
  const words = query.match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
  if (!words.length) {
    return db.query<Guidance>(`SELECT ${cols} FROM guidance_documents g WHERE g.status = 'active' AND g.language = ? ORDER BY g.category, g.title`, [docLang])
  }
  // Every word must match, in any of its spellings (the index holds Hinglish keys too, see seed.ts).
  const match = words.map((w) => `(${withFolded([w.toLowerCase()]).map((v) => `"${v}"*`).join(' OR ')})`).join(' AND ')
  return db.query<Guidance>(
    `SELECT ${cols} FROM guidance_fts f JOIN guidance_documents g ON g.id = f.id
     WHERE guidance_fts MATCH ? AND g.status = 'active'
     ORDER BY (g.language = ?) DESC, bm25(guidance_fts, 0, 10.0, 1.0, 5.0)`,
    [match, docLang],
  )
}

export async function getGuidance(db: Database, id: string): Promise<Guidance | undefined> {
  const [g] = await db.query<Guidance>(`SELECT ${cols} FROM guidance_documents g WHERE g.id = ?`, [id])
  return g
}
