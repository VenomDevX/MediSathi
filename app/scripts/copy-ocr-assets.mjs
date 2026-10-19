// Copies Tesseract worker, WASM core and language data into public/ocr so OCR works offline (no CDN).
import { cpSync, mkdirSync } from 'node:fs'

const out = new URL('../public/ocr/', import.meta.url)
const nm = new URL('../node_modules/', import.meta.url)
mkdirSync(out, { recursive: true })
cpSync(new URL('tesseract.js/dist/worker.min.js', nm), new URL('worker.min.js', out))
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(new URL(`tesseract.js-core/${f}`, nm), new URL(f, out))
}
for (const lang of ['eng', 'hin']) {
  cpSync(new URL(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, nm), new URL(`${lang}.traineddata.gz`, out))
}
