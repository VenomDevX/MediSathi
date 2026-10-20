// Model files live in this browser's private storage (OPFS), next to the database, or on Android in the app's own
// storage (native.ts). Downloaded once, then offline.
import { Capacitor } from '@capacitor/core'
import { Gemma } from './native'

const HF = 'https://huggingface.co'
const web = {
  'gemma-4-e2b': {
    name: 'Gemma 4 E2B',
    file: 'gemma-4-E2B-it-web.litertlm',
    bytes: 2_008_432_640,
    url: `${HF}/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm` as string | undefined,
    page: `${HF}/litert-community/gemma-4-E2B-it-litert-lm`,
  },
  // Gated by Google's Gemma licence: the person accepts it on Hugging Face, downloads the file, and picks it here.
  'gemma-3n-e2b': {
    name: 'Gemma 3n E2B',
    file: 'gemma-3n-E2B-it-int4-Web.litertlm',
    bytes: 3_038_117_888,
    url: undefined as string | undefined,
    page: `${HF}/google/gemma-3n-E2B-it-litert-lm`,
  },
}

export type ModelId = keyof typeof web
export type ModelInfo = (typeof web)[ModelId]

/** The browser engine needs the WebGPU builds; Android's native engine uses the CPU+GPU builds of the same models. */
export function catalogue(android: boolean): Record<ModelId, ModelInfo> {
  if (!android) return web
  return {
    'gemma-4-e2b': { ...web['gemma-4-e2b'], file: 'gemma-4-E2B-it.litertlm', bytes: 2_588_147_712, url: `${HF}/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm` },
    'gemma-3n-e2b': { ...web['gemma-3n-e2b'], file: 'gemma-3n-E2B-it-int4.litertlm', bytes: 3_655_827_456 },
  }
}

const native = Capacitor.isNativePlatform()
export const MODELS = catalogue(native)
export const MODEL_IDS = Object.keys(MODELS) as ModelId[]

const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('models', { create: true })

/** Models whose file is fully on this device. */
export async function installedModels(): Promise<ModelId[]> {
  if (native) {
    const { files } = await Gemma.installed()
    return MODEL_IDS.filter((id) => files.includes(MODELS[id].file))
  }
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
 * renames it at the end, so a stopped download never looks installed. On Android, 'pick' opens the system file picker.
 */
export async function saveModel(id: ModelId, from: 'download' | 'pick' | File, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const m = MODELS[id]
  if (native) return saveNative(m, from === 'download', onProgress, signal)
  if (from === 'pick') throw new Error('pick is Android only')
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

async function saveNative(m: ModelInfo, download: boolean, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  if (download && !m.url) throw new Error('no-download')
  const handle = await Gemma.addListener('progress', ({ fraction }) => onProgress(fraction))
  const stop = () => void Gemma.cancelSave()
  signal?.addEventListener('abort', stop)
  try {
    await Gemma.save({ file: m.file, url: download ? m.url : undefined, bytes: m.bytes })
  } finally {
    signal?.removeEventListener('abort', stop)
    await handle.remove()
  }
}

export async function removeModel(id: ModelId) {
  if (native) return Gemma.remove({ file: MODELS[id].file })
  const dir = await folder()
  for (const name of [MODELS[id].file, `${MODELS[id].file}.part`]) await dir.removeEntry(name).catch(() => {})
}
