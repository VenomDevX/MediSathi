import type { Point } from '../domain/donors'

/** The device's position, asked only when the person taps (TRD §7.2). Rejects when denied or unavailable. */
export function locate(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unavailable'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { timeout: 15000, maximumAge: 10 * 60 * 1000 },
    )
  })
}
