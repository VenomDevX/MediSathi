import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MediSaathi',
        short_name: 'MediSaathi',
        description: 'Offline health records, report explanations, first aid and blood donor search.',
        lang: 'hi',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Control the page on first install so the app works offline without a reload.
        // No skipWaiting: updates still wait, so unsynced work is never interrupted.
        clientsClaim: true,
        // OCR language data and the SQLite wasm are large; precache them so the app works offline.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,wasm,gz}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        // The LiteRT runtime is ~110 MB and only needed once someone turns on the offline model: cache it on first use
        // instead of making every install download it. The version is in the path, so cache-first never serves a stale one.
        globIgnores: ['**/litert/**'],
        runtimeCaching: [{ urlPattern: /\/litert\//, handler: 'CacheFirst', options: { cacheName: 'litert-runtime' } }],
      },
    }),
  ],
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm', '@litert-lm/core'] },
  worker: { format: 'es' },
  server: {
    fs: { allow: ['..'] },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
