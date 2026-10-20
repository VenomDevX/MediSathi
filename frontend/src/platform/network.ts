// Online/offline. Android WebView never updates navigator.onLine, so native asks the OS.
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

export function watchOnline(set: (online: boolean) => void): () => void {
  if (Capacitor.isNativePlatform()) {
    void Network.getStatus().then((s) => set(s.connected))
    const handle = Network.addListener('networkStatusChange', (s) => set(s.connected))
    return () => void handle.then((h) => h.remove())
  }
  const on = () => set(true)
  const off = () => set(false)
  addEventListener('online', on)
  addEventListener('offline', off)
  return () => {
    removeEventListener('online', on)
    removeEventListener('offline', off)
  }
}
