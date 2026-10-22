// Optional Google sign-in, shown only when VITE_GOOGLE_CLIENT_ID is set (the Web OAuth client ID; README "Google sign-in").
// Website: Google's own button (Google Identity Services). Android: Google blocks its sign-in page inside WebViews,
// so the app asks Android's Credential Manager instead. Both give an ID token that the server checks with Google.
import { Capacitor } from '@capacitor/core'

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || undefined
export const nativeGoogle = Capacitor.isNativePlatform()

type Gis = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void
      renderButton(el: HTMLElement, o: Record<string, unknown>): void
    }
  }
}

let gis: Promise<Gis> | undefined
function loadGis(): Promise<Gis> {
  return (gis ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve((window as unknown as { google: Gis }).google)
    s.onerror = () => ((gis = undefined), reject(new Error('Google sign-in did not load')))
    document.head.append(s)
  }))
}

/** Website: draws Google's button into `el`; `onToken` gets the ID token after the person picks an account. */
export async function renderGoogleButton(el: HTMLElement, locale: string, onToken: (idToken: string) => void) {
  const google = await loadGis()
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID!, callback: (r) => onToken(r.credential) })
  google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: Math.min(el.clientWidth, 400), locale })
}

/** Android: the system account picker. */
export async function nativeGoogleIdToken(): Promise<string> {
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  await SocialLogin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID } })
  const { result } = await SocialLogin.login({ provider: 'google', options: {} })
  if (result.responseType !== 'online' || !result.idToken) throw new Error('Google gave no ID token')
  return result.idToken
}
