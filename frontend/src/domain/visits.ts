export type VisitRow = {
  id: string
  patient_id: string
  worker_id: string
  amends_visit_id: string | null
  amendment_reason: string | null
  visit_time: string
  notes: string
  observations_json: string
  follow_up_at: string | null
  created_at: string
  sync_status: string
  voided_at: string | null
}

export type VisitChain = { rootId: string; current: VisitRow; history: VisitRow[]; voided: boolean }

/**
 * Visits are append-only (TRD §6.1): a correction is a new row pointing at the row it amends.
 * Groups rows into one chain per original visit; the newest row in the chain is current.
 */
export function resolveChains(rows: VisitRow[]): VisitChain[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const depth = new Map<string, number>()
  const rootOf = (r: VisitRow): string => {
    let cur = r
    let d = 0
    while (cur.amends_visit_id && byId.has(cur.amends_visit_id)) {
      cur = byId.get(cur.amends_visit_id)!
      d++
    }
    depth.set(r.id, d)
    return cur.id
  }

  const groups = new Map<string, VisitRow[]>()
  for (const r of rows) {
    const root = rootOf(r)
    groups.set(root, [...(groups.get(root) ?? []), r])
  }

  // Newest first; an amendment always outranks the row it amends, even with an equal timestamp.
  const newer = (a: VisitRow, b: VisitRow) => b.created_at.localeCompare(a.created_at) || depth.get(b.id)! - depth.get(a.id)!

  return [...groups.entries()]
    .map(([rootId, members]) => {
      const [current, ...history] = members.sort(newer)
      return { rootId, current, history, voided: current.voided_at !== null }
    })
    .sort((a, b) => b.current.visit_time.localeCompare(a.current.visit_time))
}
