import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('add a family member, note a medicine with a follow-up, and see it coming up on Today', async ({ page }) => {
  await openApp(page)
  await page.getByRole('link', { name: 'My family' }).first().click()
  await page.getByRole('link', { name: 'Add a person' }).first().click()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()
  await page.getByLabel('Name').fill('Asha')
  await page.getByLabel('Relation').selectOption('mother')
  await page.getByLabel('Year of birth').fill('1968')
  await page.getByText('Female', { exact: true }).click()
  await page.getByLabel('Blood group').selectOption('B+')
  await page.getByLabel('Long-term conditions').fill('Diabetes')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible()
  await expect(page.getByText(/Mother, \d+ years, Female/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'))
  await page.getByLabel('Details').fill('Sugar test, fasting')
  await page.getByLabel('Next due (optional)').fill(today)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Sugar test, fasting' }).getByText(/Next due/)).toBeVisible()

  await page.goto('/#/')
  const followUps = page.getByRole('region', { name: 'Follow-ups for today' })
  await expect(followUps.getByText('Sugar test, fasting')).toBeVisible()
  await followUps.getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible()

  // Removing the entry clears it from Today, and the person survives a reload
  await page.getByRole('button', { name: 'Remove: Sugar test, fasting' }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('Diabetes')).toBeVisible()
  await page.goto('/#/')
  await expect(page.getByRole('region', { name: 'Follow-ups for today' })).toHaveCount(0)
})
