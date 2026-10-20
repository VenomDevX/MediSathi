import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('Journey C: find potential donors offline with a manual location when GPS is denied', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  await page.getByRole('link', { name: 'Donors' }).first().click()
  await expect(page.getByText(/possible donors only/)).toBeVisible()
  await expect(page.getByText(/Directory updated/)).toBeVisible()

  // Location permission is not granted in this browser: search must still work
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText('Location not available. Choose a place below.')).toBeVisible()
  await page.getByLabel('Or choose a place').selectOption({ label: 'Rampur' })

  await page.getByRole('button', { name: 'B+', exact: true }).click()
  const results = page.getByRole('listitem')
  await expect(page.getByRole('heading', { name: '3 potential donors' })).toBeVisible()
  await expect(results.first()).toContainText('Rampur, About 0 km')
  await expect(results.first()).toContainText('Potential donor')
  await expect(results.first()).toContainText('Contact details are shown to coordinators only.')

  // Withdrawn consent (A+ Laharpur) is never shown
  await page.getByRole('button', { name: 'A+', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2 potential donors' })).toBeVisible()
  await expect(results.filter({ hasText: 'Laharpur' })).toHaveCount(0)

  // Search state survives a reload
  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('button', { name: 'A+', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
