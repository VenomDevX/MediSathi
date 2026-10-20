// Renders public/icon.svg to the PNG icons the PWA manifest and Android need. Full-bleed artwork with the
// mark inside the central safe zone, so the same image works as a maskable icon.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
  await page.screenshot({ path: fileURLToPath(new URL(`../public/icons/icon-${size}.png`, import.meta.url)) })
}
await browser.close()
