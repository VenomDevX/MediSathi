// Hands a file to the person: the share sheet on Android (save to Files, WhatsApp, a health locker app),
// a download in the browser. The file is written only to the app's cache, never uploaded.
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export async function shareFile(name: string, text: string, mime: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title, files: [uri] })
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
