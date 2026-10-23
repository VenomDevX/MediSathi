import { useState } from 'react'
import { useApp } from '../app-context'
import { recentSymptoms } from '../data/records'
import { detectClusters } from '../domain/outbreak'
import { useAsync } from './useAsync'

const DAY = 864e5

/** Disease clusters in the signed-in worker's villages (this week against last week); used by Outbreak and Today. */
export function useClusters() {
  const { db, user } = useApp()
  const [now] = useState(() => new Date())
  return useAsync(async () => detectClusters(await recentSymptoms(db, user, new Date(now.getTime() - 14 * DAY).toISOString()), now), [db, user, now])
}
