import type { CapacitorConfig } from '@capacitor/cli'

// The Android app wraps the same static export. The https scheme makes the WebView a secure context, so OPFS (SQLite) works.
const config: CapacitorConfig = {
  appId: 'in.medisaathi.app',
  appName: 'MediSaathi',
  webDir: 'out',
  server: { androidScheme: 'https' },
}

export default config
