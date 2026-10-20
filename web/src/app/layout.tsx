import type { Metadata, Viewport } from 'next'
import { Anek_Devanagari } from 'next/font/google'
import { Providers } from '@/ui/Providers'
import './globals.css'

// One family for Devanagari and Latin, self-hosted at build time so it works offline.
const anek = Anek_Devanagari({ subsets: ['devanagari', 'latin'], axes: ['wdth'], variable: '--font-anek', display: 'swap' })

export const metadata: Metadata = {
  title: 'MediSaathi',
  description: 'Your family health companion. Works without internet.',
  applicationName: 'MediSaathi',
  appleWebApp: { capable: true, title: 'MediSaathi' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#10131f' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="hi" className={`${anek.variable} antialiased`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
