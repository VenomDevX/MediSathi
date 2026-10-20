// Model files live in this browser's private storage (OPFS), next to the database. Downloaded once, then offline.

export const MODELS = {
  'gemma-4-e2b': {
    name: 'Gemma 4 E2B',
    file: 'gemma-4-E2B-it-web.litertlm',
    bytes: 2_008_432_640,
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
    page: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm',
  },
  // Gated by Google's Gemma licence: the person accepts it on Hugging Face, downloads the file, and picks it here.
  'gemma-3n-e2b': {
    name: 'Gemma 3n E2B',
    file: 'gemma-3n-E2B-it-int4-Web.litertlm',
    bytes: 3_038_117_888,
    url: undefined,
    page: 'https://huggingface.co/google/gemma-3n-E2B-it-litert-lm',
  },
} as const

export type ModelId = keyof typeof MODELS
export const MODEL_IDS = Object.keys(MODELS) as ModelId[]

const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('models', { create: true })

/** Models whose file is fully on this device. */
export async function installedModels(): Promise<ModelId[]> {
  try {
    const dir = await folder()
    const names: string[] = []
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name)
    return MODEL_IDS.filter((id) => names.includes(MODELS[id].file))
  } catch {
    return [] // no OPFS (old browser, private window)
  }
}

export async function openModel(id: ModelId): Promise<File> {
  return (await (await folder()).getFileHandle(MODELS[id].file)).getFile()
}

/**
 * Saves a model from the internet (Gemma 4) or from a file the person picked (Gemma 3n). Writes to a .part file and
 * renames it at the end, so a stopped download never looks installed.
 */
export async function saveModel(id: ModelId, from: 'download' | File, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const m = MODELS[id]
  await navigator.storage.persist?.()
  const { quota = Infinity, usage = 0 } = await navigator.storage.estimate()
  if (quota - usage < m.bytes) throw new Error('not-enough-space')

  let body: ReadableStream<Uint8Array>
  let total: number
  if (from === 'download') {
    if (!m.url) throw new Error('no-download')
    const res = await fetch(m.url, { signal })
    if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
    body = res.body
    total = Number(res.headers.get('content-length')) || m.bytes
  } else {
    body = from.stream()
    total = from.size
  }

  const dir = await folder()
  const part = await dir.getFileHandle(`${m.file}.part`, { create: true })
  let done = 0
  try {
    await body
      .pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, c) { done += chunk.byteLength; onProgress(done / total); c.enqueue(chunk) } }))
      .pipeTo(await part.createWritable(), { signal })
    await (part as FileSystemFileHandle & { move(name: string): Promise<void> }).move(m.file)
  } catch (e) {
    await dir.removeEntry(`${m.file}.part`).catch(() => {})
    throw e
  }
}

export async function removeModel(id: ModelId) {
  const dir = await folder()
  for (const name of [MODELS[id].file, `${MODELS[id].file}.part`]) await dir.removeEntry(name).catch(() => {})
}
