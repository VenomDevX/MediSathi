import { chromium } from '@playwright/test'
const S = process.argv[2]
const b = await chromium.launchPersistentContext(S + '/chrome-profile', { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] })
const p = b.pages()[0]
p.on('console', (m) => !m.text().includes('404') && console.log('[console]', m.type(), m.text().slice(0, 400)))
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)))
await p.goto('http://localhost:4200/more/'); await p.waitForTimeout(1500)
console.log('installed:', await p.getByText('On this device', { exact: true }).count(), ' choice:', await p.evaluate(() => localStorage.getItem('medisaathi.model')))
await p.goto('http://localhost:4200/chat/')
await p.getByRole('textbox').fill('my child has a fever, what should I do'); await p.getByRole('textbox').press('Enter')
for (let i = 0; i < 3; i++) { await p.waitForTimeout(5000); const txt = await p.locator('main').innerText(); console.log(`--- t=${(i + 1) * 5}s\n` + txt.slice(0, 700)); if (txt.includes('Where this comes from')) break }
await p.screenshot({ path: S + '/chat-gemma4.png' })
await b.close()
