import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// A real model is 2-3 GB and needs a GPU; these cover getting a model file onto the device and choosing it.
// The model's answers are covered by src/assistant/{litert,respond}.test.ts and a manual check (see README).
const GEMMA4_URL = 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm'

async function openSettings(page: Page) {
  await openApp(page)
  await page.goto('/#/settings')
}
const model = (page: Page, name: string) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) })

test('Gemma 4 E2B downloads once, stays on the device, and can be deleted', async ({ page }) => {
  await page.route(GEMMA4_URL, (r) => r.fulfill({ body: Buffer.alloc(64 * 1024, 1), contentType: 'application/octet-stream' }))
  await openSettings(page)
  const gemma4 = model(page, 'Gemma 4 E2B')
  await expect(gemma4.getByText('2.0 GB, one time')).toBeVisible()
  await gemma4.getByRole('button', { name: 'Download' }).click()
  await expect(gemma4.getByText('On this device', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(gemma4.getByText('On this device', { exact: true })).toBeVisible()
  await gemma4.getByRole('button', { name: 'Delete: Gemma 4 E2B' }).click()
  await expect(gemma4.getByRole('button', { name: 'Download' })).toBeVisible()
})

test('a failed download says so and leaves nothing half-saved', async ({ page }) => {
  await page.route(GEMMA4_URL, (r) => r.fulfill({ status: 503 }))
  await openSettings(page)
  const gemma4 = model(page, 'Gemma 4 E2B')
  await gemma4.getByRole('button', { name: 'Download' }).click()
  await expect(gemma4.getByRole('alert')).toHaveText('The model could not be saved. Check the connection and try again.')
  await expect(gemma4.getByRole('button', { name: 'Download' })).toBeVisible()
})

test('Gemma 3n E2B is added from a file the person downloaded (Google licence)', async ({ page }) => {
  await openSettings(page)
  const gemma3n = model(page, 'Gemma 3n E2B')
  await expect(gemma3n.getByRole('link', { name: 'Open on Hugging Face' })).toHaveAttribute('href', 'https://huggingface.co/google/gemma-3n-E2B-it-litert-lm')
  await gemma3n.getByLabel('Choose file: Gemma 3n E2B').setInputFiles({ name: 'gemma-3n-E2B-it-int4-Web.litertlm', mimeType: 'application/octet-stream', buffer: Buffer.alloc(32 * 1024, 2) })
  await expect(gemma3n.getByText('On this device', { exact: true })).toBeVisible()
})

test('the model choice is remembered', async ({ page }) => {
  await openSettings(page)
  await page.getByRole('radio', { name: 'Gemma 3n' }).click()
  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('radio', { name: 'Gemma 3n' })).toHaveAttribute('aria-checked', 'true')
})

test('without WebGPU it says the model cannot run here', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }))
  await openSettings(page)
  await expect(page.getByText(/This browser cannot run the model/)).toBeVisible()
})
