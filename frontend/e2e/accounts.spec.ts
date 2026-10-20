import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('switching demo accounts locks the app: each account needs its own PIN', async ({ page }) => {
  await openApp(page) // a fresh demo account must create its own PIN: no built-in PIN
  await page.goto('/#/settings')
  await page.getByRole('button', { name: /Ramesh Kumar/ }).click()

  await expect(page.getByRole('heading', { name: 'Create your PIN' })).toBeVisible()
  await page.getByLabel('PIN', { exact: true }).fill('5678')
  await page.getByLabel('Enter the PIN again').fill('5678')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByRole('heading', { name: 'Ramesh Kumar' })).toBeVisible() // unlocked, back on Settings

  await page.goto('/#/settings')
  await page.getByRole('button', { name: /Sunita Devi/ }).click()
  await expect(page.getByRole('heading', { name: 'Enter your PIN' })).toBeVisible()
  await page.getByLabel('PIN', { exact: true }).fill('5678')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('Wrong PIN. 4 tries left.')).toBeVisible()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('heading', { name: 'Sunita Devi' })).toBeVisible()
})

test('the service worker does not precache the 100+ MB on-device model runtime', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text()
  expect(sw).toContain('precache')
  expect(sw).not.toMatch(/litert\/[^"']+\.wasm/)
})
