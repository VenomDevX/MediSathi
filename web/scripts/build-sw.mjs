// Generates out/sw.js after `next build`: precaches the whole static export (pages, JS, SQLite, OCR data)
// so the app opens and works with no network after the first visit.
import { generateSW } from 'workbox-build'

const { count, size, warnings } = await generateSW({
  globDirectory: 'out',
  globPatterns: ['**/*.{html,js,mjs,css,wasm,json,txt,png,svg,ico,woff2,gz,webmanifest}'],
  globIgnores: ['sw.js', 'workbox-*.js'],
  swDest: 'out/sw.js',
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // tesseract cores are ~4 MB each
  clientsClaim: true, // control the first page load, so a first-visit user is already offline-ready
  directoryIndex: 'index.html', // trailingSlash export: /chat/ -> /chat/index.html
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/sqlite\//, /^\/ocr\//],
  ignoreURLParametersMatching: [/.*/], // /reports/view/?id=… is the same page
})
for (const w of warnings) console.warn(w)
console.log(`sw.js: precached ${count} files, ${(size / 1e6).toFixed(1)} MB`)
