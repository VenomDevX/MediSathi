import { expect, type Page } from '@playwright/test'

/** Opens the app on a fresh device (English by default) with an offline demo account (the health worker by default) and creates the PIN, landing on Today. */
export async function openApp(page: Page, lang: 'hi' | 'en' = 'en', account: 'worker' | 'citizen' = 'worker') {
  await page.goto('/')
  await page.getByRole('button', { name: account === 'worker' ? 'Health Worker (ASHA) Demo' : 'Citizen / Family (Normal User)' }).click()
  await createPin(page)
  if (lang === 'hi') await page.getByRole('button', { name: 'हिंदी' }).click()
}

export async function createPin(page: Page) {
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByLabel('Enter the PIN again').fill('1234')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByRole('heading', { name: /Namaste/ })).toBeVisible()
}
