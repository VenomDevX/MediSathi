import { expect, test } from '@playwright/test'

test('home opens in Hindi, remembers English, and leads to the assistant and emergency', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /सेहत से जुड़ा कोई भी सवाल पूछें/ })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await expect(page.getByRole('link', { name: /Ask about any health worry/ })).toHaveAttribute('href', '/chat/')
  await page.reload()
  await expect(page.getByRole('link', { name: /Ask about any health worry/ })).toBeVisible()

  await page.getByRole('link', { name: 'Open emergency numbers' }).click()
  await expect(page.getByRole('heading', { name: 'Emergency' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Call 108/ })).toHaveAttribute('href', 'tel:108')
})

test('works offline after the first visit, including emergency numbers', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('इंटरनेट नहीं है। ऐप फिर भी चलेगा।')).toBeVisible()
  await page.goto('/emergency/?rule=snake-bite')
  await expect(page.getByRole('link', { name: /108 पर कॉल करें/ })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'सांप ने काटा' })).toBeVisible()
})
