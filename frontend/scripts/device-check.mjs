// Drives the installed debug APK on an emulator/phone in airplane mode through the PRD journeys.
// Prereq: debug APK installed and open on a fresh install (or after `adb shell pm clear in.medisaathi.app`).
// Usage: node scripts/device-check.mjs <screenshot-dir>
import { chromium, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const adb = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`
const shots = process.argv[2] ?? '.'
const sample = fileURLToPath(new URL('../../content/samples/sample-lab-report.png', import.meta.url))
const step = (s) => console.log(`ok  ${s}`)
const shot = (name) => execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 26 })
// Taps a native (non-WebView) button, e.g. a system permission dialog, by its visible text.
function tapText(text) {
  for (let i = 0; i < 20; i++) {
    const xml = execFileSync(adb, ['exec-out', 'uiautomator', 'dump', '/dev/tty']).toString()
    const m = xml.match(new RegExp(String.raw`text="${text}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"`))
    if (m) return execFileSync(adb, ['shell', 'input', 'tap', String((+m[1] + +m[3]) >> 1), String((+m[2] + +m[4]) >> 1)])
  }
  throw new Error(`no "${text}" on screen`)
}
const save = async (name) => (await import('node:fs')).writeFileSync(`${shots}/${name}.png`, shot())

async function connect() {
  for (let i = 0; ; i++) {
    try {
      const pid = execFileSync(adb, ['shell', 'pidof', 'in.medisaathi.app']).toString().trim()
      execFileSync(adb, ['forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`])
      const b = await chromium.connectOverCDP('http://localhost:9333', { timeout: 5000 })
      const p = b.contexts()[0].pages()[0]
      p.setDefaultTimeout(20_000)
      return [b, p]
    } catch (e) {
      if (i === 10) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}
let [b, page] = await connect()

execFileSync(adb, ['shell', 'cmd', 'connectivity', 'airplane-mode', 'enable'])
step('airplane mode on')

await page.getByRole('button', { name: 'डेमो खाता इस्तेमाल करें' }).click()
await page.getByLabel('पिन', { exact: true }).fill('4826')
await page.getByLabel('पिन दोबारा डालें').fill('4826')
await page.getByRole('button', { name: 'पिन सेव करें' }).click()
await expect(page.getByRole('heading', { name: /नमस्ते/ })).toBeVisible()
await expect(page.getByText('आप ऑफ़लाइन हैं।')).toBeVisible()
await save('apk-today-hi')
step('app shows it is offline')
await page.getByRole('button', { name: 'English' }).click()
step('demo sign-in + PIN offline')

// Journey B
const tomorrow = await page.evaluate(() => new Date(Date.now() + 864e5).toLocaleDateString('en-CA'))
await page.goto('https://localhost/#/patients/new')
await page.getByLabel('Name').fill('Meena Kushwaha')
await page.getByLabel('Age (years)').fill('31')
await page.getByLabel('Village').fill('Rampur')
await page.getByText('Female', { exact: true }).click()
await page.getByRole('button', { name: 'Save patient' }).click()
await page.getByRole('link', { name: 'Add visit' }).click()
await page.getByLabel('Notes').fill('Second trimester check.')
await page.getByLabel('Follow-up date (optional)').fill(tomorrow)
await page.getByRole('button', { name: 'Save visit' }).click()
await save('apk-permission')
tapText('Allow')
await expect(page.getByText('Second trimester check.')).toBeVisible()
await save('apk-patient')
step('Journey B: patient + visit with follow-up saved offline')

// Reminder is scheduled when the app goes to the background: press Home, then reopen
// (backgrounding detaches the DevTools target, so reconnect after reopening)
await b.close()
execFileSync(adb, ['shell', 'input', 'keyevent', 'KEYCODE_HOME'])
await new Promise((r) => setTimeout(r, 2000))
execFileSync(adb, ['shell', 'monkey', '-p', 'in.medisaathi.app', '-c', 'android.intent.category.LAUNCHER', '1'])
await new Promise((r) => setTimeout(r, 2000))
;[b, page] = await connect()
const pending = await page.evaluate(() => window.Capacitor.Plugins.LocalNotifications.getPending())
const mine = pending.notifications.find((n) => n.id === Number(tomorrow.replaceAll('-', '')))
if (!mine) throw new Error(`no reminder for ${tomorrow}: ${JSON.stringify(pending)}`)
if (/Meena|trimester/i.test(mine.title + mine.body)) throw new Error(`reminder leaks patient data: ${mine.body}`)
step(`reminder scheduled for ${tomorrow} 09:00: "${mine.title}: ${mine.body}"`)

// Journey A: OCR in the WebView, offline
await page.getByRole('link', { name: 'Reports' }).first().click()
await page.getByLabel('Choose a file').setInputFiles(sample)
await expect(page.getByRole('heading', { name: 'Check the values' })).toBeVisible({ timeout: 180_000 })
await expect(page.locator('input[name="value-0"]')).toHaveValue('9.8')
await save('apk-review')
step('Journey A: on-device OCR read the sample report offline')

// Guidance + emergency
await page.getByRole('link', { name: 'Guidance' }).first().click()
const search = page.getByLabel(/Search a symptom/)
await search.fill('bukhar')
await expect(page.getByRole('link', { name: /What to do for a fever/ })).toBeVisible()
await search.fill('saanp ne kata')
await expect(page.getByRole('alert').getByRole('link', { name: 'Call 108' })).toHaveAttribute('href', 'tel:108')
await save('apk-emergency')
step('guidance search + emergency escalation offline')

// Journey C: donors with manual locality
await page.getByRole('link', { name: 'Donors' }).first().click()
await page.getByLabel('Or choose a place').selectOption({ label: 'Rampur' })
await page.getByRole('button', { name: 'B+', exact: true }).click()
await expect(page.getByRole('heading', { name: '3 potential donors' })).toBeVisible()
await save('apk-donors')
step('Journey C: donor search with manual place offline')

execFileSync(adb, ['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'])
await b.close()
