import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openApp } from './helpers'

const sample = fileURLToPath(new URL('../../content/samples/sample-lab-report.png', import.meta.url))

test('Journey A: read a lab report photo offline, review the values, see plain explanations', async ({ page, context }) => {
  test.setTimeout(120_000)
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  await page.getByRole('link', { name: 'Reports' }).first().click()
  await expect(page.getByText('It is not a diagnosis.')).toBeVisible()
  await page.getByLabel('Choose a file').setInputFiles(sample)

  // OCR runs on the device; review screen shows parsed values
  await expect(page.getByRole('heading', { name: 'Check the values' })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('list').getByText('Haemoglobin', { exact: true })).toBeVisible()
  await expect(page.locator('input[name="value-0"]')).toHaveValue('9.8')
  await expect(page.getByRole('list').getByText('Platelet count', { exact: true })).toBeVisible()

  // Any value OCR got wrong is flagged for review, and the reviewer fixes it from the original
  const tshCard = page.getByRole('listitem').filter({ hasText: 'TSH' })
  if (await tshCard.getByText('Check this value').isVisible()) {
    // Cannot confirm while a flagged value is unchecked
    await page.getByRole('button', { name: 'Values are correct, explain' }).click()
    await expect(page.getByText(/still need checking/)).toBeVisible()
    await expect(tshCard.getByLabel('Value')).toBeFocused()
    await tshCard.getByLabel('Value').fill('2.1')
    await tshCard.getByLabel('Range from').fill('0.4')
    await tshCard.getByLabel('Range to').fill('4.0')
  }

  // Link to the patient so her ranges are used, then confirm
  await page.getByLabel('Whose report is this (optional)').selectOption({ label: 'Kamla Yadav, Rampur' })
  await page.getByRole('button', { name: 'Values are correct, explain' }).click()

  await expect(page.getByRole('heading', { name: 'What the report means' })).toBeVisible()
  await expect(page.getByText(/values are outside the usual range/)).toBeVisible()
  const hb = page.getByRole('listitem').filter({ hasText: 'Haemoglobin' })
  await expect(hb.getByText('Low', { exact: true })).toBeVisible()
  await expect(hb.getByText(/anaemia/)).toBeVisible()
  await expect(hb.getByText('from the report')).toBeVisible()
  const tsh = page.getByRole('listitem').filter({ hasText: 'TSH' })
  await expect(tsh.getByText('Normal', { exact: true })).toBeVisible()

  // Saved and reopenable offline
  await page.getByRole('link', { name: 'Reports' }).first().click()
  await expect(page.getByText('sample-lab-report.png')).toBeVisible()
  await expect(page.getByText('Checked')).toBeVisible()
})

test('a citizen links a report to a family member and finds it on their page', async ({ page }) => {
  test.setTimeout(120_000)
  await openApp(page, 'en', 'citizen')
  await page.getByRole('link', { name: 'Read a report' }).click()
  await page.getByLabel('Choose a file').setInputFiles(sample)
  await expect(page.getByRole('heading', { name: 'Check the values' })).toBeVisible({ timeout: 90_000 })
  const flagged = page.getByRole('button', { name: 'Value is correct' })
  while (await flagged.count()) await flagged.first().click()
  await page.getByLabel('Whose report is this (optional)').selectOption({ label: 'Me' })
  await page.getByRole('button', { name: 'Values are correct, explain' }).click()
  await expect(page.getByRole('heading', { name: 'What the report means' })).toBeVisible()

  // Ask about it: the answer comes from the report's own checked values
  await page.getByRole('link', { name: 'Ask about this report' }).click()
  await expect(page.getByRole('link', { name: 'Talking about the report: sample-lab-report.png' })).toBeVisible()
  const box = page.getByRole('textbox', { name: 'Type your question…' })
  await box.fill('is my haemoglobin okay?')
  await box.press('Enter')
  await expect(page.getByText(/Haemoglobin: 9.8 g\/dL, low/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Your report: sample-lab-report.png/ })).toHaveAttribute('href', /^#\/scan\//)

  await page.goto('/#/family')
  await page.getByRole('link', { name: 'Me Me' }).click() // the person's name, then their relation
  await expect(page.getByRole('region', { name: 'Reports' }).getByRole('link', { name: /sample-lab-report.png/ })).toBeVisible()
})
