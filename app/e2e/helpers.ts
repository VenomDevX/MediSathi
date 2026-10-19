import { expect, type Page } from '@playwright/test'

/** Opens the app on a fresh device and creates the PIN, landing on Today. */
export async function openApp(page: Page, lang: 'hi' | 'en' = 'en') {
  await page.goto('/')
  await page.getByLabel('पिन', { exact: true }).fill('4826')
  await page.getByLabel('पिन दोबारा डालें').fill('4826')
  await page.getByRole('button', { name: 'पिन सेव करें' }).click()
  await expect(page.getByRole('heading', { name: /नमस्ते/ })).toBeVisible()
  if (lang === 'en') await page.getByRole('button', { name: 'English' }).click()
}
