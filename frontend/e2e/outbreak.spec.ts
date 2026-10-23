import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('a fever cluster in Rampur raises an offline outbreak warning, and new visits record symptoms', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  // Demo visits: 5 fever patients in Rampur this week, 1 the week before
  const alert = page.getByRole('link', { name: 'Possible outbreak: 5 fever cases in Rampur this week' })
  await expect(alert).toBeVisible()
  await alert.click()
  await expect(page.getByRole('heading', { name: 'Outbreak warning' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Map of villages' })).toBeVisible()
  await expect(page.getByText('5 this week, 1 the week before')).toBeVisible()
  await expect(page.getByText('Sitapur Kalan: Diarrhoea')).toBeVisible() // 2 cases: listed, no warning
  await expect(page.getByRole('status').filter({ hasText: 'Sitapur Kalan' })).toHaveCount(0)

  // A sixth fever patient is counted at once
  await page.goto('/#/patients')
  await page.getByRole('link', { name: /Kamla Yadav/ }).click()
  await page.getByRole('link', { name: 'Add visit' }).click()
  await page.getByRole('button', { name: 'Fever' }).click()
  await expect(page.getByRole('button', { name: 'Fever' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Save visit' }).click()
  await expect(page.getByText('Fever', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Today' }).first().click()
  await page.getByRole('link', { name: 'Possible outbreak: 6 fever cases in Rampur this week' }).click()
  await expect(page.getByText('6 this week, 1 the week before')).toBeVisible()
})
