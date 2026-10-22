import { afterEach, describe, expect, it, vi } from 'vitest'
import { googleSignIn, login, signup } from './api'
import { AuthError, NetworkError } from './engine'

const answer = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
afterEach(() => vi.unstubAllGlobals())

describe('sign-in calls', () => {
  it('posts the sign-up details and returns the session', async () => {
    answer(200, { access_token: 'a', refresh_token: 'r', user: { id: 'u-1', display_name: 'Asha', role: 'citizen', assigned_scope: [] } })
    expect((await signup('Asha', 'asha', 'long-enough')).user.role).toBe('citizen')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/auth\/signup$/)
    expect(JSON.parse(init!.body as string)).toEqual({ display_name: 'Asha', username: 'asha', password: 'long-enough' })
  })

  it('says why a sign-in was refused', async () => {
    answer(409, { detail: 'username_taken' })
    await expect(signup('Asha', 'sunita', 'long-enough')).rejects.toEqual(new AuthError('username_taken'))
    answer(401, { detail: 'invalid_credentials' })
    await expect(login('sunita', 'wrong')).rejects.toBeInstanceOf(AuthError)
    answer(401, { detail: 'invalid_google_token' })
    await expect(googleSignIn('tok')).rejects.toEqual(new AuthError('invalid_google_token'))
  })

  it('treats server outages as offline and limits as a plain failure', async () => {
    answer(503, { detail: 'google_sign_in_off' })
    await expect(googleSignIn('tok')).rejects.toBeInstanceOf(NetworkError)
    answer(429, { detail: 'too_many_attempts' })
    const err = await login('sunita', 'x').catch((e) => e)
    expect(err).not.toBeInstanceOf(AuthError)
  })
})
