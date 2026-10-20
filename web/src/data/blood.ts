// Blood requests go through the server (backend/app/blood.py); everything else in the app is on-device.
// No accounts: each request and each donor registration has a random token kept only on this device.
// A donor's number reaches a requester only after that donor accepts that request.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export type Place = { blood_group: string; locality_label: string; latitude: number | null; longitude: number | null }
export type MyRequest = Place & { id: string; token: string; note: string; created_at: string; expires_at: string }
export type RequestStatus = { id: string; status: 'open' | 'closed'; expires_at: string; donors: { locality_label: string | null; contact: string; accepted_at: string }[] }
export type IncomingRequest = Place & { id: string; note: string; created_at: string; expires_at: string; my_answer: 'accepted' | 'declined' | null }
export type MyDonor = { token: string; blood_group: string; locality_label: string }

export class BloodApiError extends Error {
  constructor(readonly kind: 'offline' | 'unauthorized' | 'not-found' | 'failed') {
    super(kind)
  }
}

const REQUESTS_KEY = 'medisaathi.bloodRequests'
const DONOR_KEY = 'medisaathi.donor'

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

async function api<T>(path: string, { method = 'GET', token, body }: { method?: 'GET' | 'POST'; token?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/v1/blood${path}`, { method: body === undefined ? method : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new BloodApiError('offline')
  }
  if (res.status === 401) throw new BloodApiError('unauthorized')
  if (res.status === 404) throw new BloodApiError('not-found')
  if (!res.ok) throw new BloodApiError('failed')
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const myRequests = (): MyRequest[] => read(REQUESTS_KEY, [])
export const forgetRequest = (id: string) => write(REQUESTS_KEY, myRequests().filter((r) => r.id !== id))

export async function askForBlood(ask: Place & { note: string }): Promise<MyRequest> {
  const { id, token, expires_at } = await api<{ id: string; token: string; expires_at: string }>('/requests', { body: ask })
  const saved = { ...ask, id, token, expires_at, created_at: new Date().toISOString() }
  write(REQUESTS_KEY, [saved, ...myRequests()])
  return saved
}

export const requestStatus = (r: Pick<MyRequest, 'id' | 'token'>) => api<RequestStatus>(`/requests/${r.id}`, { token: r.token })
export const closeRequest = (r: Pick<MyRequest, 'id' | 'token'>) => api<void>(`/requests/${r.id}/close`, { method: 'POST', token: r.token })

const donor = (): MyDonor | null => read(DONOR_KEY, null)
export const myDonor = donor
export const myDonorToken = () => donor()?.token ?? null

async function asDonor<T>(call: (token: string) => Promise<T>): Promise<T> {
  const me = donor()
  if (!me) throw new BloodApiError('unauthorized')
  try {
    return await call(me.token)
  } catch (e) {
    // Withdrawn or removed on the server: this device is no longer a donor.
    if (e instanceof BloodApiError && e.kind === 'unauthorized') write(DONOR_KEY, null)
    throw e
  }
}

export async function registerDonor(reg: Place & { contact: string; consent: true }) {
  const { token } = await api<{ token: string }>('/donors', { body: reg })
  write(DONOR_KEY, { token, blood_group: reg.blood_group, locality_label: reg.locality_label } satisfies MyDonor)
}

export async function withdrawDonor() {
  await asDonor((token) => api<void>('/donors/me/withdraw', { method: 'POST', token }))
  write(DONOR_KEY, null)
}

export const incomingRequests = () => asDonor((token) => api<{ requests: IncomingRequest[] }>('/requests/for-me', { token })).then((r) => r.requests)
export const answerRequest = (id: string, accept: boolean) => asDonor((token) => api<void>(`/requests/${id}/respond`, { token, body: { accept } }))
