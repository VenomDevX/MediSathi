import { chromium } from '@playwright/test'
const MODEL = process.argv[2], LABEL = process.argv[3]
const b = await chromium.launchPersistentContext(process.argv[4], { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] })
const p = b.pages()[0] ?? await b.newPage()
p.on('console', (m) => m.type() === 'warning' && m.text().startsWith('Model') && console.log('[console]', m.text().slice(0, 300)))
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)))
await p.goto('http://localhost:4200/more/'); await p.evaluate(() => localStorage.setItem('lang', 'en')); await p.reload()
await p.waitForTimeout(1500)
if (!(await p.getByText('On this device', { exact: true }).count())) {
  let t0 = Date.now()
  await p.getByLabel(`Choose file: ${LABEL}`).setInputFiles(MODEL)
  await p.getByText('On this device', { exact: true }).waitFor({ timeout: 600000 })
  console.log(`imported in ${Date.now() - t0} ms`)
}
await p.getByRole('radio', { name: LABEL.replace(' E2B', '') }).click()
for (const [lang, q] of [['en', 'my child has a fever, what should I do'], ['hi', 'बच्चे को बुखार है क्या करें'], ['en', 'how much paracetamol for fever'], ['en', 'my hand got burned with hot oil'], ['en', 'snake bite']]) {
  await p.goto('http://localhost:4200/chat/'); await p.evaluate((l) => localStorage.setItem('lang', l), lang); await p.goto('http://localhost:4200/chat/')
  const t0 = Date.now(); await p.getByRole('textbox').fill(q); await p.getByRole('textbox').press('Enter')
  await p.locator('[class*=animate-pulse]').first().waitFor().catch(() => {}); await p.waitForFunction(() => !document.querySelector('[class*=animate-pulse]'), null, { timeout: 300000 })
  console.log(`\n=== ${q}  (${Date.now() - t0} ms)\n` + (await p.locator('main article, main [role=alert]').last().innerText()).slice(0, 900))
}
await b.close()
