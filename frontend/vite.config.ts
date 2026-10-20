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
        theme_color: '#f4f6f3',
        background_color: '#f4f6f3',
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
