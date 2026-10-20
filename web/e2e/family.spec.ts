import { expect, test } from '@playwright/test'

test('add a family member, note a medicine with a follow-up, and see it coming up on Home', async ({ page }) => {
  await page.goto('/records/')
  await page.evaluate(() => localStorage.setItem('lang', 'en'))
  await page.reload()
  await expect(page.getByText(/Keep your own and your family's health records here/)).toBeVisible()
  await page.getByRole('link', { name: 'Add a person' }).first().click()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()
  await page.getByLabel('Name').fill('Sunita')
  await page.getByLabel('Relation').selectOption('mother')
  await page.getByLabel('Year of birth').fill('1968')
  await page.getByText('Female', { exact: true }).click()
  await page.getByLabel('Blood group').selectOption('B+')
  await page.getByLabel('Long-term conditions').fill('Diabetes')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('heading', { name: 'Sunita' })).toBeVisible()
  await expect(page.getByText(/Mother, \d+ years, Female/)).toBeVisible()
  const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).toLocaleDateString('en-CA'))
  await page.getByLabel('Details').fill('Sugar test, fasting')
  await page.getByLabel('Next due (optional)').fill(tomorrow)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Sugar test, fasting' }).getByText(/Next due/)).toBeVisible()

  await page.getByRole('link', { name: 'Home' }).first().click()
  const comingUp = page.getByRole('region', { name: 'Coming up' })
  await expect(comingUp.getByText('Sugar test, fasting')).toBeVisible()
  await comingUp.getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Sunita' })).toBeVisible()

  // Removing the entry clears it from Coming up, and it all survives a reload
  await page.getByRole('button', { name: 'Remove: Sugar test, fasting' }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Diabetes')).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Coming up' })).toHaveCount(0)
})
