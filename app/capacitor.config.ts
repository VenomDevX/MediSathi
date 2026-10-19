import type { CapacitorConfig } from '@capacitor/cli'

// Android app wraps the same web build. https scheme = secure context, so OPFS (SQLite storage) works in the WebView.
const config: CapacitorConfig = {
  appId: 'in.medisaathi.app',
  appName: 'MediSaathi',
  webDir: 'dist',
  server: { androidScheme: 'https' },
}

export default config
