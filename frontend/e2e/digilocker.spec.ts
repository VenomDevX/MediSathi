import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('ASHA worker checks a patient\'s ABHA against DigiLocker (demo), offline, and sees a mismatch named', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  await page.goto('/#/patients')
  await page.getByRole('link', { name: /Kamla Yadav/ }).click()
  await page.getByRole('button', { name: 'Verify ABHA with DigiLocker (demo)' }).click()
  await expect(page.getByText(/Demo only: not connected to DigiLocker/)).toBeVisible()
  await page.getByRole('button', { name: 'Share (demo)' }).click()
  await expect(page.getByText(/ABHA verified with DigiLocker \(demo\)/)).toBeVisible()
  await page.reload()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText(/ABHA verified with DigiLocker \(demo\)/)).toBeVisible() // kept on the device

  await page.goto('/#/patients')
  await page.getByRole('link', { name: /Guddi Bano/ }).click()
  await page.getByRole('button', { name: 'Verify ABHA with DigiLocker (demo)' }).click()
  await page.getByRole('button', { name: 'Share (demo)' }).click()
  await expect(page.getByRole('alert')).toHaveText('Does not match DigiLocker: age or date of birth. Check the details with the person.')
})
