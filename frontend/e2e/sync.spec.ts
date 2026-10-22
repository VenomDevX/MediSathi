import { expect, test, type Page } from '@playwright/test'
import { createPin } from './helpers'

const API = 'http://localhost:8000'

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Username').fill('sunita')
  await page.getByLabel('Password').fill('demo-1234')
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await createPin(page)
}

test('changing the PIN keeps the account signed in and syncing', async ({ page }) => {
  await signIn(page)
  await page.goto('/#/settings')
  await page.getByLabel('PIN', { exact: true }).fill('4321')
  await page.getByLabel('Enter the PIN again').fill('4321')
  await page.getByRole('button', { name: 'Change PIN' }).click()
  await expect(page.getByText('PIN updated successfully.')).toBeVisible()
  // A sync after the change rotates the refresh token, which must be kept under the new PIN
  await page.goto('/#/sync')
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Everything is synced')).toBeVisible()

  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('4321')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Everything is synced')).toBeVisible()
  await expect(page.getByText('The demo account does not sync.', { exact: false })).toHaveCount(0)
})

test('records made offline reach the server once connectivity returns, with no duplicates', async ({ page, context, request }) => {
  const name = `Sync Test ${Date.now()}`

  // First sign-in needs the network
  await signIn(page)
  await page.evaluate(() => navigator.serviceWorker.ready)

  // A signed-in account cannot hop to the offline demo accounts
  await page.goto('/#/settings')
  await expect(page.getByRole('button', { name: /Ramesh Kumar/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Switch account' })).toHaveCount(0)

  // Work offline
  await context.setOffline(true)
  await page.goto('/#/patients/new')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Save patient' }).click()
  await expect(page.getByText('Not synced').first()).toBeVisible()

  // Connectivity returns: sync runs on the online event
  await context.setOffline(false)
  await page.goto('/#/sync')
  await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Everything is synced')).toBeVisible()

  // The server has exactly one copy
  const { access_token } = await (await request.post(`${API}/api/v1/auth/login`, { data: { username: 'sunita', password: 'demo-1234' } })).json()
  const pulled = await (await request.get(`${API}/api/v1/sync/pull?cursor=0&limit=1000`, { headers: { Authorization: `Bearer ${access_token}` } })).json()
  expect(pulled.changes.filter((c: { entity: { display_name?: string } }) => c.entity.display_name === name)).toHaveLength(1)

  // And the record shows as synced on the device
  await page.goto('/#/patients')
  await page.getByLabel(/Search by name/).fill(name)
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
  await expect(page.getByText('Not synced')).toHaveCount(0)
})

test('a citizen creates an account, sets a PIN and lands on their own home', async ({ page }) => {
  const username = `asha${Date.now()}`
  await page.goto('/')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await page.getByLabel('Your name').fill('Asha Devi')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('long-enough-1')
  await page.getByRole('button', { name: 'Create account' }).last().click()
  await createPin(page)
  await expect(page.getByRole('heading', { name: 'Namaste, Asha' })).toBeVisible()

  // The same username cannot be taken twice
  const again = await page.request.post(`${API}/api/v1/auth/signup`, { data: { display_name: 'Other', username, password: 'long-enough-2' } })
  expect(again.status()).toBe(409)
})
