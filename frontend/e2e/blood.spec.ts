import { expect, test, type Browser } from '@playwright/test'
import { openApp } from './helpers'

// Two phones: one asks for blood, one is a donor. Both talk to the real API (playwright.config webServer).
async function device(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await openApp(page)
  await page.getByRole('link', { name: 'Blood donors' }).click()
  return { context, page }
}

test('a donor accepts a request and only then the requester sees their number', async ({ browser }) => {
  const note = `Surgery at district hospital ${Date.now()}` // the e2e API keeps earlier runs' requests
  const donor = await device(browser)
  const requester = await device(browser)

  // Donor joins; consent is required.
  await donor.page.getByRole('link', { name: 'Become a donor' }).click()
  await donor.page.getByLabel('Blood group').selectOption('O+')
  await donor.page.getByLabel('Near').selectOption({ label: 'Sitapur' })
  await donor.page.getByLabel('Your phone number').fill('00000 00001')
  await donor.page.getByRole('button', { name: 'Join as a donor' }).click()
  await expect(donor.page.getByText('Your agreement is needed to continue')).toBeVisible()
  await donor.page.getByRole('checkbox').check()
  await donor.page.getByRole('button', { name: 'Join as a donor' }).click()
  await expect(donor.page.getByText('You are an O+ donor near Sitapur')).toBeVisible()

  // Requester sends a request; no number yet.
  await requester.page.getByRole('link', { name: 'Send a blood request' }).click()
  await requester.page.getByLabel('Blood group').selectOption('O+')
  await requester.page.getByLabel('Near').selectOption({ label: 'Sitapur' })
  await requester.page.getByLabel('Message (optional)').fill(note)
  await requester.page.getByRole('button', { name: 'Send request' }).click()
  const card = requester.page.getByRole('region', { name: 'Your requests' })
  await expect(card.getByText('O+ blood near Sitapur')).toBeVisible()
  await expect(card.getByText('No donor has said yes yet.')).toBeVisible()
  await expect(card.getByText('00000 00001')).toHaveCount(0)

  // Donor sees it and accepts.
  await donor.page.getByRole('button', { name: 'Refresh' }).click()
  const incoming = donor.page.locator('div').filter({ hasText: note }).filter({ has: donor.page.getByRole('button', { name: 'Yes, share my number' }) }).last()
  await incoming.getByRole('button', { name: 'Yes, share my number' }).click()
  await expect(donor.page.locator('div').filter({ hasText: note }).last()).toBeVisible()
  await expect(donor.page.getByText('You said yes; your number was shared').first()).toBeVisible()

  // Now the requester gets the number, and can close the request.
  await card.getByRole('button', { name: 'Refresh' }).click()
  await expect(card.getByText('Donors who said yes: 1')).toBeVisible()
  await expect(card.getByText('00000 00001')).toBeVisible()
  await expect(card.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:0000000001')
  await card.getByRole('button', { name: 'Close request' }).click()
  await expect(card.getByText('Closed')).toBeVisible()

  // A closed request disappears for donors; the donor can then leave, which erases their number.
  await donor.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(donor.page.getByText(note)).toHaveCount(0)
  await donor.page.getByRole('button', { name: 'Stop being a donor' }).click()
  await donor.page.getByRole('button', { name: 'Yes, remove my number' }).click()
  await expect(donor.page.getByRole('button', { name: 'Join as a donor' })).toBeVisible()

  await donor.context.close()
  await requester.context.close()
})

test('sending a request without internet says so and saves nothing', async ({ page }) => {
  await openApp(page)
  await page.goto('/#/blood')
  await page.route('http://localhost:8000/**', (route) => route.abort('internetdisconnected'))
  await page.getByLabel('Blood group').selectOption('B-')
  await page.getByLabel('Near').selectOption({ label: 'Rampur' })
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('This needs the internet. Connect and try again.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your requests' })).toHaveCount(0)
})
