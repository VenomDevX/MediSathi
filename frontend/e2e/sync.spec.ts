import { expect, test } from '@playwright/test'
import { createPin } from './helpers'

const API = 'http://localhost:8000'

test('records made offline reach the server once connectivity returns, with no duplicates', async ({ page, context, request }) => {
  const name = `Sync Test ${Date.now()}`

  // First sign-in needs the network
  await page.goto('/')
  await page.getByLabel('यूज़रनेम').fill('sunita')
  await page.getByLabel('पासवर्ड').fill('demo-1234')
  await page.getByRole('button', { name: 'साइन इन करें' }).last().click()
  await createPin(page)
  await page.getByRole('button', { name: 'English' }).click()
  await page.evaluate(() => navigator.serviceWorker.ready)

  // A signed-in account cannot hop to the offline demo accounts
  await page.goto('/#/settings')
  await expect(page.getByRole('button', { name: /Ramesh Kumar/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Switch Account' })).toHaveCount(0)

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
