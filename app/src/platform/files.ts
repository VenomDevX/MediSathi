// Original report files live in the browser's private file system (OPFS), next to the database.

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
