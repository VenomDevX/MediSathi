// Original report files live in the browser's private file system (OPFS), next to the database.

/**
 * The only file types accepted and ever displayed. SVG and HTML are excluded on purpose:
 * shown from a same-origin blob URL they could run script with access to patient data.
 */
export const SAFE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' }
export const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf'
export const isSafeType = (type: string) => Object.values(SAFE_TYPES).includes(type)

/** Type for displaying a stored file, from the allowlist only (OPFS does not keep the original type). */
export const safeTypeFor = (fileName: string) => SAFE_TYPES[fileName.split('.').pop()?.toLowerCase() ?? '']

async function dir() {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('reports', { create: true })
}

export async function sha256(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Returns false when the browser cannot keep files; the report still works from its extracted text. */
export async function saveFile(id: string, blob: Blob): Promise<boolean> {
  try {
    const handle = await (await dir()).getFileHandle(id, { create: true })
    const w = await handle.createWritable()
    await w.write(blob)
    await w.close()
    return true
  } catch {
    return false
  }
}

export async function readFile(id: string): Promise<File | undefined> {
  try {
    return await (await (await dir()).getFileHandle(id)).getFile()
  } catch {
    return undefined
  }
}
