// Usage: node scripts/shots.mjs <outDir> <route...>  (needs `vite preview` on :4173)
import { chromium, devices } from '@playwright/test'
const [out, ...routes] = process.argv.slice(2)
const browser = await chromium.launch()
const configs = [
  ['phone-light', { ...devices['Pixel 7'], colorScheme: 'light' }],
  ['phone-dark', { ...devices['Pixel 7'], colorScheme: 'dark' }],
  ['laptop-light', { viewport: { width: 1280, height: 800 }, colorScheme: 'light' }],
]
for (const [name, opts] of configs) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  for (const r of routes) {
    await page.goto(`http://localhost:4173/#${r}`)
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${out}/${name}${r.replaceAll('/', '_') || '_home'}.png`, fullPage: true })
  }
  await ctx.close()
}
await browser.close()
