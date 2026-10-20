// Screenshots for design review: node scripts/shots.mjs <out-dir> [route ...]. Needs the export served on :4200.
import { chromium } from '@playwright/test'

const [dir = '.', ...routes] = process.argv.slice(2)
const browser = await chromium.launch()
for (const [w, h] of [[360, 780], [1280, 800]])
  for (const scheme of ['light', 'dark'])
    for (const lang of ['hi', 'en']) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: w < 500 ? 2 : 1 })
      await page.addInitScript((l) => localStorage.setItem('lang', l), lang)
      for (const r of routes.length ? routes : ['/']) {
        await page.goto(`http://localhost:4200${r}`)
        await page.waitForTimeout(600)
        await page.screenshot({ path: `${dir}/${r.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${w}-${scheme}-${lang}.png`, fullPage: true })
      }
      await page.close()
    }
await browser.close()
