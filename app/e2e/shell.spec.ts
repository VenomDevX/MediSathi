import { expect, test } from '@playwright/test'

test('app opens, switches language, and keeps working offline after first load', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'नमस्ते, Sunita' })).toBeVisible()

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Namaste, Sunita' })).toBeVisible()

  // Wait for the service worker to take control, then cut the network and reload.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Namaste, Sunita' })).toBeVisible()
  await expect(page.getByText('You are offline.')).toBeVisible()
})

