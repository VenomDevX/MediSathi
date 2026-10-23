import { expect, test } from '@playwright/test'
import { createPin } from './helpers'

test('a coordinator texts matching donors through the phone SMS app', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('rakesh')
  await page.getByLabel('Password').fill('demo-1234')
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await createPin(page)
  await page.goto('/#/sync')
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Everything is synced')).toBeVisible()

  await page.goto('/#/donors?group=O%2B&place=sitapur')
  await page.getByRole('button', { name: 'Text these donors by SMS' }).click()
  const open = page.getByRole('link', { name: /Open SMS app \(\d+ numbers\)/ })
  await expect(open).toHaveAttribute('href', /^sms:\+91000000000\d(,\+9100000000\d\d)*\?body=MediSaathi%3A%20urgent%20need%20for%20O%2B%20blood%20near%20Sitapur/)
})

test('a blood request can be shared by SMS and WhatsApp', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Citizen / Family (Normal User)' }).click()
  await createPin(page)
  await page.goto('/#/blood')
  await page.getByLabel('Blood group').selectOption('B+')
  await page.getByLabel('Near').selectOption({ label: 'Rampur' })
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByRole('link', { name: 'Share by SMS' })).toHaveAttribute('href', /^sms:\?body=Urgent%3A%20B%2B%20blood%20needed%20near%20Rampur/)
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=Urgent/)
})
