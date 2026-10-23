// Potential donor search over the cached directory (TRD §7.1). Results are potential matches only:
// the blood bank confirms compatibility and availability (PRD BL-08, BL-09).

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export type Donor = {
  id: string
  blood_group: string
  approx_latitude: number | null
  approx_longitude: number | null
  locality_label: string | null
  consent_status: string
  registration_status: string
  last_verified_at: string | null
  deleted_at: string | null
}

export type Point = { lat: number; lng: number }

/** Haversine great-circle distance. Approximate ranking only, not road travel time. */
export function distanceKm(a: Point, b: Point): number {
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function findDonors(
  donors: Donor[],
  { group, from, now, freshDays }: { group: string; from: Point | null; now: Date; freshDays: number },
): (Donor & { distance_km: number | null })[] {
  if (!(BLOOD_GROUPS as readonly string[]).includes(group)) throw new Error(`Unknown blood group: ${group}`)
  const cutoff = now.getTime() - freshDays * 864e5
  return donors
    .filter(
      (d) =>
        d.blood_group === group &&
        d.consent_status === 'granted' &&
        d.registration_status === 'active' &&
        !d.deleted_at &&
        d.last_verified_at !== null &&
        Date.parse(d.last_verified_at) >= cutoff,
    )
    .map((d) => ({
      ...d,
      distance_km:
        from && d.approx_latitude !== null && d.approx_longitude !== null
          ? Math.round(distanceKm(from, { lat: d.approx_latitude, lng: d.approx_longitude }))
          : null,
    }))
    .sort(
      (a, b) =>
        (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) || (b.last_verified_at ?? '').localeCompare(a.last_verified_at ?? ''),
    )
}

export const SMS_MAX = 20 // ponytail: one SMS app hand-off; Android messaging apps cap group texts around here

/** A link that opens the phone's own SMS app with recipients and text filled in. Plain SMS: no internet, no gateway. */
export function smsLink(numbers: string[], body: string): string {
  const to = numbers.map((n) => n.replace(/[^\d+]/g, '')).filter(Boolean).slice(0, SMS_MAX)
  return `sms:${to.join(',')}?body=${encodeURIComponent(body)}`
}
