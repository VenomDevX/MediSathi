import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('assistant answers offline from the library, flags emergencies, admits what it does not know', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  await page.getByRole('link', { name: /Ask about any health worry/ }).click()
  const box = page.getByRole('textbox', { name: 'Type your question…' })

  // Grounded answer with its source
  await box.fill('mere bete ko kal se bukhar hai')
  await box.press('Enter')
  await expect(page.getByText(/Rest and drink plenty of water/)).toBeVisible()
  const source = page.getByRole('link', { name: /What to do for a fever/ })
  await expect(source).toHaveAttribute('href', '#/guidance/fever-en')

  // Emergency first
  await box.fill('saanp ne kata')
  await page.getByRole('button', { name: 'Send' }).click()
  const alert = page.getByRole('alert').filter({ hasText: 'This may be an emergency' })
  await expect(alert.getByRole('link', { name: 'Call 108' })).toHaveAttribute('href', 'tel:108')

  // Outside the library: no guess
  await box.fill('best phone under 10000')
  await box.press('Enter')
  await expect(page.getByText(/I don't have reliable information about this/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call 104' })).toBeVisible()
  // Saved replies follow the language picked later
  await page.getByRole('button', { name: 'हिंदी' }).click()
  await expect(page.getByText(/इस बारे में मेरे पास भरोसेमंद जानकारी नहीं है/)).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()

  // The source opens the full item
  await source.click()
  await expect(page.getByRole('heading', { name: 'What to do for a fever' })).toBeVisible()

  // History survives leaving the chat and can be deleted
  await page.goto('/#/chat')
  await page.getByRole('link', { name: 'mere bete ko kal se bukhar hai' }).click()
  await expect(page.getByText(/Rest and drink plenty of water/)).toBeVisible()
  await page.getByRole('link', { name: 'New chat' }).click()
  await page.getByRole('button', { name: 'Delete chat: mere bete ko kal se bukhar hai' }).click()
  await expect(page.getByRole('link', { name: 'mere bete ko kal se bukhar hai' })).toHaveCount(0)
})

test('suggestion chips ask in Hindi', async ({ page }) => {
  await openApp(page, 'hi')
  await page.goto('/#/chat')
  await page.getByRole('button', { name: 'हाथ जल गया' }).click()
  await expect(page.getByRole('link', { name: /जल/ }).first()).toBeVisible()
})
