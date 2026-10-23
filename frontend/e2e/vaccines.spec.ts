import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('ASHA worker sees vaccines and checkups due, and records a dose offline', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  // Demo: a 9-week-old with only birth doses, and a woman 17 weeks pregnant
  const due = page.getByRole('region', { name: 'Vaccines and checkups due' })
  await expect(due.getByRole('link', { name: /Baby of Kamla.*Pentavalent-1/ })).toBeVisible()
  await expect(due.getByRole('link', { name: /Guddi Bano.*2nd checkup/ })).toBeVisible()

  await due.getByRole('link', { name: /Baby of Kamla/ }).click()
  const vaccines = page.getByRole('heading', { name: 'Vaccines' }).locator('..')
  await expect(vaccines.getByText('3 given')).toBeVisible()
  await vaccines.getByRole('button', { name: 'Given today: Pentavalent-1' }).click()
  await expect(vaccines.getByText('4 given')).toBeVisible()
  await expect(vaccines.getByRole('button', { name: 'Given today: Pentavalent-1' })).toHaveCount(0)
  await expect(page.getByText('Given: Pentavalent-1')).toBeVisible() // recorded as a visit, so it syncs

  await page.goto('/#/patients')
  await page.getByRole('link', { name: /Guddi Bano/ }).click()
  await expect(page.getByText(/Week 17, expected delivery/)).toBeVisible()
})

test('a family member with a date of birth gets a vaccine card', async ({ page }) => {
  await openApp(page, 'en', 'citizen')
  await page.goto('/#/family/new')
  await page.getByLabel('Name').fill('Chhotu')
  await page.getByLabel('Relation').selectOption('child')
  const dob = new Date(Date.now() - 50 * 864e5).toISOString().slice(0, 10)
  await page.getByLabel('Date of birth').fill(dob)
  await page.getByLabel('ABHA number (if any)').fill('1234')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('An ABHA number has 14 digits.')).toBeVisible()
  await page.getByLabel('ABHA number (if any)').fill('12-3456-7890-1234')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('heading', { name: 'Vaccines' })).toBeVisible()
  await page.getByRole('button', { name: 'Given today: BCG' }).click()
  await expect(page.getByText('1 given')).toBeVisible()
})
