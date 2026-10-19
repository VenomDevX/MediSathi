import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('Journey B: record a patient and visit offline, correct it, see the follow-up', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  // Seeded synthetic patients are visible and searchable
  await page.getByRole('link', { name: 'Patients' }).first().click()
  await expect(page.getByText('Kamla Yadav')).toBeVisible()
  await page.getByLabel('Search by name, village or ID').fill('guddi')
  await expect(page.getByText('Guddi Bano')).toBeVisible()
  await expect(page.getByText('Kamla Yadav')).toBeHidden()

  // Add a patient
  await page.goto('/#/patients/new')
  await page.getByRole('button', { name: 'Save patient' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()
  await page.getByLabel('Name').fill('Meena Kushwaha')
  await page.getByLabel('Age (years)').fill('31')
  await page.getByLabel('Village').fill('Rampur')
  await page.getByText('Female', { exact: true }).click()
  await page.getByRole('button', { name: 'Save patient' }).click()
  await expect(page.getByRole('heading', { name: 'Meena Kushwaha' })).toBeVisible()
  await expect(page.getByText('Not synced').first()).toBeVisible()

  // Add a visit with a follow-up today
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'))
  await page.getByRole('link', { name: 'Add visit' }).click()
  await page.getByLabel('Notes').fill('Second trimester check. Advised iron tablets.')
  await page.getByLabel('Blood pressure').fill('118/76')
  await page.getByLabel('Follow-up date (optional)').fill(today)
  await page.getByRole('button', { name: 'Save visit' }).click()
  await expect(page.getByText('Second trimester check. Advised iron tablets.')).toBeVisible()
  await expect(page.getByText('Blood pressure 118/76')).toBeVisible()

  // Correct it: original kept in history
  await page.getByRole('link', { name: 'Correct' }).click()
  await page.getByLabel('Notes').fill('Second trimester check. Advised iron and calcium tablets.')
  await page.getByRole('button', { name: 'Save correction' }).click()
  await expect(page.getByText('Enter a reason.')).toBeVisible()
  await page.getByLabel('Reason for correction').fill('Missed calcium')
  await page.getByRole('button', { name: 'Save correction' }).click()
  await expect(page.getByText('Advised iron and calcium tablets.')).toBeVisible()
  await expect(page.getByText('Corrected: Missed calcium')).toBeVisible()
  await page.getByText('Earlier versions (1)').click()
  await expect(page.getByText(/Advised iron tablets\./)).toBeVisible()

  // Survives a reload, and the follow-up shows on Today
  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('4826')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('Advised iron and calcium tablets.')).toBeVisible()
  await page.getByRole('link', { name: 'Today' }).first().click()
  await expect(page.getByRole('heading', { name: 'Follow-ups for today' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Meena Kushwaha/ })).toBeVisible()
})
