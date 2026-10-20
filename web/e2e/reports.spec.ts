import { expect, test } from '@playwright/test'
import path from 'node:path'

const sample = path.join(__dirname, '../../content/samples/sample-lab-report.png')

test('read a lab report photo offline, check the values, see what they mean, and ask about it', async ({ page, context }) => {
  test.setTimeout(150_000)
  // A person to link the report to, so her usual ranges are used
  await page.goto('/records/edit/')
  await page.evaluate(() => localStorage.setItem('lang', 'en'))
  await page.reload()
  await page.getByLabel('Name').fill('Sunita')
  await page.getByText('Female', { exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Sunita' })).toBeVisible()

  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.goto('/reports/')
  await expect(page.getByText('It is not a diagnosis.')).toBeVisible()
  await page.getByLabel('Choose a file').setInputFiles(sample)

  // OCR runs on the device; the review screen shows the values it read
  await expect(page.getByRole('heading', { name: 'Check the values' })).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('input[name="value-0"]')).toHaveValue('9.8')

  // A value OCR may have misread is flagged and must be checked before anything is explained
  const tshCard = page.getByRole('listitem').filter({ hasText: 'TSH' })
  if (await tshCard.getByText('Check this value').isVisible()) {
    await page.getByRole('button', { name: 'Values are correct, explain' }).click()
    await expect(page.getByText(/still need checking/)).toBeVisible()
    await expect(tshCard.getByLabel('Value')).toBeFocused()
    await tshCard.getByLabel('Value').fill('2.1')
    await tshCard.getByLabel('Range from').fill('0.4')
    await tshCard.getByLabel('Range to').fill('4.0')
  }
  await page.getByLabel('Whose report is this (optional)').selectOption({ label: 'Sunita' })
  await page.getByRole('button', { name: 'Values are correct, explain' }).click()

  await expect(page.getByRole('heading', { name: 'What the report means' })).toBeVisible()
  await expect(page.getByText("Sunita's report")).toBeVisible()
  const hb = page.getByRole('listitem').filter({ hasText: 'Haemoglobin' })
  await expect(hb.getByText('Low', { exact: true })).toBeVisible()
  await expect(hb.getByText(/anaemia/)).toBeVisible()

  // Ask about it: the answer comes from the report's own checked values
  await page.getByRole('link', { name: 'Ask about this report' }).click()
  await expect(page.getByRole('link', { name: /Talking about the report: sample-lab-report.png/ })).toBeVisible()
  const box = page.getByRole('textbox', { name: 'Type your question…' })
  await box.fill('is my haemoglobin okay?')
  await box.press('Enter')
  await expect(page.getByText(/Haemoglobin: 9.8 g\/dL, low/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Your report: sample-lab-report.png/ })).toHaveAttribute('href', /\/reports\/view\/\?id=/)

  // Saved: listed under Reports and on Sunita's page
  await page.goto('/reports/')
  await expect(page.getByRole('link', { name: /sample-lab-report.png.*Checked/ })).toBeVisible()
  await page.goto('/records/')
  await page.getByRole('link', { name: /Sunita/ }).click()
  await expect(page.getByRole('link', { name: /sample-lab-report.png/ })).toBeVisible()
})
