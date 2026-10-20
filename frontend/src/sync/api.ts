import { AuthError, NetworkError, type SyncApi } from './engine'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export type LoginResult = {
  access_token: string
  refresh_token: string
  user: { id: string; display_name: string; role: string; assigned_scope: string[] }
  server_time: string
}

/** fetch that turns "no connection" and server outages into NetworkError, so callers retry later. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  } catch {
    throw new NetworkError('offline')
  }
  if (res.status >= 500) throw new NetworkError(`server ${res.status}`)
  return res
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  if (res.status === 401) throw new AuthError('invalid_credentials')
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  return res.json()
}

export async function logout(refreshToken: string) {
  await request('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }).catch(() => {})
}

/**
 * Authenticated API for the sync engine. Access tokens are short-lived and kept in memory only;
 * on 401 the refresh token is rotated once and `onRefresh` persists the new one (PIN-wrapped).
 */
export function createApi(refreshToken: string, onRefresh: (token: string) => Promise<void>): SyncApi {
  let access: string | null = null
  let refresh = refreshToken

  async function renew() {
    const res = await request('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) })
    if (!res.ok) throw new AuthError('session_expired')
    const body: LoginResult = await res.json()
    access = body.access_token
    refresh = body.refresh_token
    await onRefresh(refresh)
  }

  async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!access) await renew()
    let res = await request(path, { ...init, headers: { Authorization: `Bearer ${access}` } })
    if (res.status === 401) {
      await renew()
      res = await request(path, { ...init, headers: { Authorization: `Bearer ${access}` } })
    }
    if (res.status === 401) throw new AuthError('session_expired')
    if (!res.ok) throw new Error(`${path}: ${res.status}`)
    return res.json()
  }

  return {
    push: async (operations) => (await authed<{ results: Awaited<ReturnType<SyncApi['push']>> }>('/api/v1/sync/push', { method: 'POST', body: JSON.stringify({ operations }) })).results,
    pull: (cursor) => authed(`/api/v1/sync/pull?cursor=${cursor}`),
    directory: () => authed('/api/v1/donors/directory'),
  }
}
