// Blood requests go through the server (backend/app/blood.py); everything else in the app is on-device.
// No server accounts: each request and each donor registration has a random token kept only on this device,
// under the local account that made it (`owner`, the signed-in user id).
// A donor's number reaches a requester only after that donor accepts that request.

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type Place = { blood_group: string; locality_label: string; latitude: number | null; longitude: number | null }
export type MyRequest = Place & { id: string; token: string; note: string; created_at: string; expires_at: string }
export type RequestStatus = { id: string; status: 'open' | 'closed'; expires_at: string; donors: { locality_label: string | null; contact: string; accepted_at: string }[] }
export type IncomingRequest = Place & { id: string; note: string; created_at: string; expires_at: string; my_answer: 'accepted' | 'declined' | null }
export type MyDonor = { token: string; blood_group: string; locality_label: string }

export class BloodApiError extends Error {
  readonly kind: 'offline' | 'unauthorized' | 'not-found' | 'failed'
  constructor(kind: 'offline' | 'unauthorized' | 'not-found' | 'failed') {
    super(kind)
    this.kind = kind
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

/** `owner`'s copy of `base`. Earlier builds kept one copy per device: the first account to open it takes it over. */
function mine(base: string, owner: string): string {
  const key = `${base}.${owner}`
  try {
    const legacy = localStorage.getItem(base)
    if (legacy !== null && localStorage.getItem(key) === null) localStorage.setItem(key, legacy)
    if (legacy !== null) localStorage.removeItem(base)
  } catch {}
  return key
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

export const myRequests = (owner: string): MyRequest[] => read(mine(REQUESTS_KEY, owner), [])
export const forgetRequest = (owner: string, id: string) => write(mine(REQUESTS_KEY, owner), myRequests(owner).filter((r) => r.id !== id))

export async function askForBlood(owner: string, ask: Place & { note: string }): Promise<MyRequest> {
  const { id, token, expires_at } = await api<{ id: string; token: string; expires_at: string }>('/requests', { body: ask })
  const saved = { ...ask, id, token, expires_at, created_at: new Date().toISOString() }
  write(mine(REQUESTS_KEY, owner), [saved, ...myRequests(owner)])
  return saved
}

export const requestStatus = (r: Pick<MyRequest, 'id' | 'token'>) => api<RequestStatus>(`/requests/${r.id}`, { token: r.token })
export const closeRequest = (r: Pick<MyRequest, 'id' | 'token'>) => api<void>(`/requests/${r.id}/close`, { method: 'POST', token: r.token })

export const myDonor = (owner: string): MyDonor | null => read(mine(DONOR_KEY, owner), null)
export const myDonorToken = (owner: string) => myDonor(owner)?.token ?? null

async function asDonor<T>(owner: string, call: (token: string) => Promise<T>): Promise<T> {
  const me = myDonor(owner)
  if (!me) throw new BloodApiError('unauthorized')
  try {
    return await call(me.token)
  } catch (e) {
    // Withdrawn or removed on the server: this account is no longer a donor.
    if (e instanceof BloodApiError && e.kind === 'unauthorized') write(mine(DONOR_KEY, owner), null)
    throw e
  }
}

export async function registerDonor(owner: string, reg: Place & { contact: string; consent: true }) {
  const { token } = await api<{ token: string }>('/donors', { body: reg })
  write(mine(DONOR_KEY, owner), { token, blood_group: reg.blood_group, locality_label: reg.locality_label } satisfies MyDonor)
}

export async function withdrawDonor(owner: string) {
  await asDonor(owner, (token) => api<void>('/donors/me/withdraw', { method: 'POST', token }))
  write(mine(DONOR_KEY, owner), null)
}

export const incomingRequests = (owner: string) => asDonor(owner, (token) => api<{ requests: IncomingRequest[] }>('/requests/for-me', { token })).then((r) => r.requests)
export const answerRequest = (owner: string, id: string, accept: boolean) =>
  asDonor(owner, (token) => api<void>(`/requests/${id}/respond`, { token, body: { accept } }))
