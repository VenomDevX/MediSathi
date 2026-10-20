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
  await page.goto('http://localhost:4173/')
  if (process.env.LOCK) await page.screenshot({ path: `${out}/${name}_signin.png` })
  await page.getByRole('button', { name: 'डेमो खाता इस्तेमाल करें' }).click()
  await page.getByLabel('पिन', { exact: true }).fill('4826')
  await page.getByLabel('पिन दोबारा डालें').fill('4826')
  if (process.env.LOCK) await page.screenshot({ path: `${out}/${name}_lock.png` })
  await page.getByRole('button', { name: 'पिन सेव करें' }).click()
  await page.waitForTimeout(500)
  for (const r of routes) {
    await page.goto(`http://localhost:4173/#${r}`)
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${out}/${name}${r.replace(/[^a-z0-9-]+/gi, '_') || '_home'}.png`, fullPage: true })
  }
  await ctx.close()
}
await browser.close()
