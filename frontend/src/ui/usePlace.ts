import { useEffect, useState } from 'react'
import { useApp } from '../app-context'
import type { Point } from '../domain/donors'
import { localities } from '../localities'

// Where the person usually is, remembered on this device: a village id or a GPS point. Only used to find the nearest
// health centre; it never leaves the device.
const KEY = 'medisaathi.place'
const EVENT = 'medisaathi-place'
type Saved = { id: string } | Point

function load(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

export function usePlace() {
  const { user } = useApp()
  const [saved, setSaved] = useState(load)
  useEffect(() => {
    const sync = () => setSaved(load())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  // A health worker with nothing saved starts at their first village.
  const fallback = user.assigned_scope.map((s) => s.replace(/^village-/, '')).find((id) => localities.some((l) => l.id === id))
  const place = saved ?? (fallback ? { id: fallback } : null)
  const locality = place && 'id' in place ? localities.find((l) => l.id === place.id) : undefined
  const point: Point | null = place && 'lat' in place ? place : locality ? { lat: locality.lat, lng: locality.lng } : null

  function save(p: Saved | null) {
    try {
      if (p) localStorage.setItem(KEY, JSON.stringify(p))
      else localStorage.removeItem(KEY)
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
    setSaved(p)
    window.dispatchEvent(new Event(EVENT))
  }

  return { point, placeId: place ? ('id' in place ? place.id : 'gps') : '', save }
}
