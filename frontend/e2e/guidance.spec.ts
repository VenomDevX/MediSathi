import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('guidance search works offline and red-flag searches escalate to emergency numbers', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  await page.getByRole('link', { name: 'First aid' }).click() // Today's tile: the phone nav has no Guidance tab
  await page.getByLabel(/Search a symptom/).fill('bukhar')
  await expect(page.getByRole('link', { name: /What to do for a fever/ })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.getByRole('link', { name: /What to do for a fever/ }).click()
  await expect(page.getByRole('heading', { name: 'What to do', exact: true })).toBeVisible()
  await expect(page.getByText('Not clinically reviewed (demo)')).toBeVisible()
  await expect(page.getByText(/does not replace a doctor/)).toBeVisible()

  await page.goBack()
  await page.getByLabel(/Search a symptom/).fill('saanp ne kata')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('This may be an emergency: Snake bite')
  await expect(alert.getByRole('link', { name: 'Call 108' })).toHaveAttribute('href', 'tel:108')
  await alert.getByRole('link', { name: 'See emergency numbers' }).click()
  await expect(page.getByRole('link', { name: /Call 102/ })).toHaveAttribute('href', 'tel:102')
  await expect(page.getByRole('alert')).toContainText('Do not cut, suck or tie the bite.')
})

test('emergency numbers are reachable from the lock screen without the PIN', async ({ page }) => {
  await openApp(page)
  await page.reload()
  await page.getByRole('link', { name: 'Emergency' }).click()
  await expect(page.getByRole('link', { name: /Call 108/ })).toHaveAttribute('href', 'tel:108')
  await expect(page.getByText('Patients')).toHaveCount(0)
})
