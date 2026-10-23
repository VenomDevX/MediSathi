// Nearest government health facilities from a place, by straight-line distance (no road data offline).
// Demo list, synthetic locations (content/health_centres.json).
import { distanceKm, type Point } from './donors'

export type Centre = { id: string; name: string; type: 'subcentre' | 'phc' | 'chc' | 'district' | 'medical-college'; lat: number; lng: number; open24h: boolean }

/**
 * The nearest centre, and also the nearest one open 24 hours when the nearest is not:
 * in an emergency at night a closed PHC is no help.
 */
export function nearestCentres(from: Point, centres: Centre[]): (Centre & { km: number })[] {
  const sorted = centres.map((c) => ({ ...c, km: Math.round(distanceKm(from, c) * 10) / 10 })).sort((a, b) => a.km - b.km)
  const [first] = sorted
  if (!first) return []
  return first.open24h ? [first] : [first, ...sorted.filter((c) => c.open24h).slice(0, 1)]
}
