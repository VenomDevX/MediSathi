import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askForBlood, BloodApiError, forgetRequest, myDonorToken, myRequests, registerDonor, requestStatus, withdrawDonor } from './blood'

const ME = 'u-ramesh'
const OTHER = 'u-sunita'
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
    await askForBlood(ME, { blood_group: 'O+', locality_label: 'Sitapur', latitude: null, longitude: null, note: '' })
    expect(myRequests(ME)).toMatchObject([{ id: 'br-1', token: 'secret', blood_group: 'O+' }])
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
    await askForBlood(ME, { blood_group: 'O+', locality_label: 'Sitapur', latitude: null, longitude: null, note: '' })
    forgetRequest(ME, 'br-1')
    expect(myRequests(ME)).toEqual([])
  })
})

describe('donor registration', () => {
  it('keeps the donor token after registering', async () => {
    vi.stubGlobal('fetch', reply(201, { donor_id: 'd-1', token: 'donor-secret' }))
    await registerDonor(ME, { blood_group: 'B+', locality_label: 'Sitapur', latitude: null, longitude: null, contact: 'x', consent: true })
    expect(myDonorToken(ME)).toBe('donor-secret')
  })

  it('drops the donor token when the server no longer accepts it', async () => {
    store.set('medisaathi.donor', JSON.stringify({ token: 'old', blood_group: 'B+' }))
    vi.stubGlobal('fetch', reply(401, { detail: 'invalid_token' }))
    await expect(withdrawDonor(ME)).rejects.toBeInstanceOf(BloodApiError)
    expect(myDonorToken(ME)).toBeNull()
  })
})

describe('accounts on one device', () => {
  it("keeps each account's requests and donor registration to itself", async () => {
    vi.stubGlobal('fetch', reply(201, { id: 'br-1', token: 'secret', expires_at: '' }))
    await askForBlood(ME, { blood_group: 'O+', locality_label: 'Sitapur', latitude: null, longitude: null, note: '' })
    vi.stubGlobal('fetch', reply(201, { donor_id: 'd-1', token: 'donor-secret' }))
    await registerDonor(ME, { blood_group: 'B+', locality_label: 'Sitapur', latitude: null, longitude: null, contact: 'x', consent: true })

    expect(myRequests(OTHER)).toEqual([])
    expect(myDonorToken(OTHER)).toBeNull()
    expect(myRequests(ME)).toHaveLength(1)
  })

  it('gives what an earlier build kept for the whole device to the first account that opens it', () => {
    store.set('medisaathi.bloodRequests', JSON.stringify([{ id: 'br-old', token: 't' }]))
    expect(myRequests(ME)).toMatchObject([{ id: 'br-old' }])
    expect(myRequests(OTHER)).toEqual([])
    expect(store.has('medisaathi.bloodRequests')).toBe(false)
  })
})
