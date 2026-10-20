// Copies runtime assets that must load as plain files, offline, without the bundler touching them:
// - Tesseract worker, WASM core and language data (OCR without a CDN)
// - the LiteRT-LM runtime (it picks one of four WASM builds by browser features; its default loads from a CDN)
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'

const nm = new URL('../node_modules/', import.meta.url)
const pub = new URL('../public/', import.meta.url)
const copy = (from, to) => {
  mkdirSync(new URL('.', new URL(to, pub)), { recursive: true })
  cpSync(new URL(from, nm), new URL(to, pub))
}

// OCR: Tesseract worker, WASM core, language data
copy('tesseract.js/dist/worker.min.js', 'ocr/worker.min.js')
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copy(`tesseract.js-core/${f}`, `ocr/${f}`)
}
for (const lang of ['eng', 'hin']) {
  copy(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `ocr/${lang}.traineddata.gz`)
}

// LiteRT-LM: versioned folder so service worker caches the JS and WASM from the same release together.
const { version: litert } = JSON.parse(readFileSync(new URL('@litert-lm/core/package.json', nm), 'utf8'))
rmSync(new URL('litert/', pub), { recursive: true, force: true })
for (const f of ['', '_compat', '_asyncify', '_compat_asyncify']) {
  for (const ext of ['js', 'wasm']) {
    copy(`@litert-lm/core/wasm/litertlm_wasm${f}_internal.${ext}`, `litert/${litert}/litertlm_wasm${f}_internal.${ext}`)
  }
}
