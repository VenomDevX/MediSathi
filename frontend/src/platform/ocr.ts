// On-device text extraction (PRD MS-02, TRD §5). Everything is served from this app, nothing from a CDN.
import { Capacitor } from '@capacitor/core'
import { createWorker, type Worker as TessWorker } from 'tesseract.js'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type OcrLine = { text: string; confidence: number }
export type Progress = (p: { stage: 'loading' | 'reading'; page: number; pages: number; fraction: number }) => void

const base = `${import.meta.env.BASE_URL}ocr`

let workerPromise: Promise<TessWorker> | undefined
let onProgress: Progress | undefined
let current = { page: 1, pages: 1 }

function getWorker() {
  workerPromise ??= createWorker(['eng', 'hin'], 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
    gzip: !Capacitor.isNativePlatform(), // Android's packager unzips .gz assets and drops the extension
    cacheMethod: 'none', // files are already precached by the service worker
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.({ stage: 'reading', ...current, fraction: m.progress })
      else onProgress?.({ stage: 'loading', ...current, fraction: m.progress })
    },
  })
  return workerPromise
}

async function ocrImage(image: Blob | HTMLCanvasElement): Promise<OcrLine[]> {
  const worker = await getWorker()
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false })
  return (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence }))))
}

/** Groups pdf.js text items into lines by their vertical position. */
async function pdfTextLines(page: pdfjs.PDFPageProxy): Promise<OcrLine[]> {
  const content = await page.getTextContent()
  const rows = new Map<number, { x: number; s: string }[]>()
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const y = Math.round(item.transform[5])
    rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4], s: item.str }])
  }
  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, parts]) => ({ text: parts.sort((a, b) => a.x - b.x).map((p) => p.s).join('   '), confidence: 100 }))
}

async function renderPage(page: pdfjs.PDFPageProxy): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
  return canvas
}

/**
 * Extracts text lines from an image or PDF. PDFs with a usable text layer are read directly
 * (exact, fast); scanned PDFs are rendered and OCR'd page by page.
 */
export async function extractText(file: File, progress?: Progress): Promise<OcrLine[]> {
  onProgress = progress
  try {
    if (file.type !== 'application/pdf') {
      current = { page: 1, pages: 1 }
      return await ocrImage(file)
    }
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    const lines: OcrLine[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      current = { page: i, pages: pdf.numPages }
      const page = await pdf.getPage(i)
      const textLines = await pdfTextLines(page)
      lines.push(...(textLines.map((l) => l.text).join('').length > 40 ? textLines : await ocrImage(await renderPage(page))))
    }
    return lines
  } finally {
    onProgress = undefined
  }
}
