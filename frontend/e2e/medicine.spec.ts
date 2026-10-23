import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

const strip = fileURLToPath(new URL('../../content/samples/sample-medicine-strip.png', import.meta.url))

test('a medicine strip is recognised offline with its use, warning and expiry', async ({ page, context }) => {
  test.slow() // OCR runs in the browser
  await openApp(page, 'en', 'citizen')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  await page.goto('/#/scan')
  await page.getByRole('link', { name: 'Scan a medicine strip' }).click()
  await expect(page.getByRole('heading', { name: 'Check a medicine' })).toBeVisible()
  await page.getByLabel('Choose a file').setInputFiles(strip)

  await expect(page.getByRole('heading', { name: 'Paracetamol 650 mg' })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/no more than 4 doses|more than 4 doses/)).toBeVisible()
  await expect(page.getByText(/Expires: .*2028/)).toBeVisible()

  await page.getByRole('link', { name: 'Ask about this medicine' }).click()
  await expect(page.getByRole('textbox', { name: 'Type your question…' })).toHaveValue('What is Paracetamol for and how should it be taken?')
})
