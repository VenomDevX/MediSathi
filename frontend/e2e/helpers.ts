import { expect, type Page } from '@playwright/test'

/** Opens the app on a fresh device with an offline demo account (the health worker by default) and creates the PIN, landing on Today. */
export async function openApp(page: Page, lang: 'hi' | 'en' = 'en', account: 'worker' | 'citizen' = 'worker') {
  await page.goto('/')
  await page.getByRole('button', { name: account === 'worker' ? 'स्वास्थ्य कार्यकर्ता (आशा) खाता' : 'नागरिक / परिवार (सामान्य खाता)' }).click()
  await createPin(page)
  if (lang === 'en') await page.getByRole('button', { name: 'English' }).click()
}

export async function createPin(page: Page) {
  await page.getByLabel('पिन', { exact: true }).fill('1234')
  await page.getByLabel('पिन दोबारा डालें').fill('1234')
  await page.getByRole('button', { name: 'पिन सेव करें' }).click()
  await expect(page.getByRole('heading', { name: /नमस्ते/ })).toBeVisible()
}
