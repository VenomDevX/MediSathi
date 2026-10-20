import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('app keeps working offline after first load and asks for the PIN again', async ({ page, context }) => {
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Namaste, Sunita' })).toBeVisible()

  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('0000')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('Wrong PIN. 4 tries left.')).toBeVisible()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('heading', { name: 'Namaste, Sunita' })).toBeVisible()
  await expect(page.getByText('You are offline.')).toBeVisible()
})
