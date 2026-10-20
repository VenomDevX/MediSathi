import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Static files only: the same build is the PWA and the Capacitor Android app. All data lives on the device.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    root: path.join(__dirname, '..'), // bundled demo content lives in ../content
    rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } },
  },
}

export default nextConfig
