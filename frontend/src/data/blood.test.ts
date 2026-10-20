import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askForBlood, BloodApiError, forgetRequest, myDonorToken, myRequests, registerDonor, requestStatus, withdrawDonor } from './blood'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
})
afterEach(() => vi.unstubAllGlobals())

const reply = (status: number, body?: unknown) => vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))

describe('blood requests', () => {
  it('remembers a new request and its token on this device', async () => {
    vi.stubGlobal('fetch', reply(201, { id: 'br-1', token: 'secret', expires_at: '2026-10-23T00:00:00Z' }))
    await askForBlood({ blood_group: 'O+', locality_label: 'Sitapur', latitude: null, longitude: null, note: '' })
    expect(myRequests()).toMatchObject([{ id: 'br-1', token: 'secret', blood_group: 'O+' }])
  })

  it('sends the request token as a bearer token', async () => {
    const fetch = reply(200, { id: 'br-1', donors: [] })
    vi.stubGlobal('fetch', fetch)
    await requestStatus({ id: 'br-1', token: 'secret' })
    expect(fetch.mock.calls[0]).toMatchObject([expect.stringContaining('/api/v1/blood/requests/br-1'), { headers: { Authorization: 'Bearer secret' } }])
  })

  it('reports no connection as offline, not as a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(requestStatus({ id: 'br-1', token: 'x' })).rejects.toMatchObject({ kind: 'offline' })
  })

  it('forgets a request', async () => {
    vi.stubGlobal('fetch', reply(201, { id: 'br-1', token: 'secret', expires_at: '' }))
    await askForBlood({ blood_group: 'O+', locality_label: 'Sitapur', latitude: null, longitude: null, note: '' })
    forgetRequest('br-1')
    expect(myRequests()).toEqual([])
  })
})

describe('donor registration', () => {
  it('keeps the donor token after registering', async () => {
    vi.stubGlobal('fetch', reply(201, { donor_id: 'd-1', token: 'donor-secret' }))
    await registerDonor({ blood_group: 'B+', locality_label: 'Sitapur', latitude: null, longitude: null, contact: 'x', consent: true })
    expect(myDonorToken()).toBe('donor-secret')
  })

  it('drops the donor token when the server no longer accepts it', async () => {
    store.set('medisaathi.donor', JSON.stringify({ token: 'old', blood_group: 'B+' }))
    vi.stubGlobal('fetch', reply(401, { detail: 'invalid_token' }))
    await expect(withdrawDonor()).rejects.toBeInstanceOf(BloodApiError)
    expect(myDonorToken()).toBeNull()
  })
})
