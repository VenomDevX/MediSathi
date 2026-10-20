import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// The app calls the API at localhost:8000; tests send those calls to a throwaway in-memory backend on :8010.
const TEST_API = 'http://localhost:8010'

async function open(context: BrowserContext, path: string): Promise<Page> {
  await context.route('http://localhost:8000/**', async (route) => {
    const res = await route.fetch({ url: route.request().url().replace('http://localhost:8000', TEST_API) })
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } })
  })
  const page = await context.newPage()
  await page.goto(path)
  await page.evaluate(() => localStorage.setItem('lang', 'en'))
  await page.reload()
  return page
}

test('a donor accepts a request and only then the requester sees their number', async ({ browser }) => {
  const donorContext = await browser.newContext()
  const requesterContext = await browser.newContext()
  const donor = await open(donorContext, '/donors/give/')
  const requester = await open(requesterContext, '/donors/')

  // Donor joins; consent is required.
  await donor.getByLabel('Blood group').selectOption('O+')
  await donor.getByLabel('Near').selectOption('sitapur')
  await donor.getByLabel('Your phone number').fill('00000 00001')
  await donor.getByRole('button', { name: 'Join as a donor' }).click()
  await expect(donor.getByText('Your agreement is needed to continue')).toBeVisible()
  await donor.getByRole('checkbox').check()
  await donor.getByRole('button', { name: 'Join as a donor' }).click()
  await expect(donor.getByText('You are an O+ donor near Sitapur')).toBeVisible()

  // Requester sees the offline directory, then sends a request.
  await requester.getByLabel('Blood group').selectOption('O+')
  await requester.getByLabel('Near').selectOption('sitapur')
  await expect(requester.getByText(/\d+ possible donors/)).toBeVisible()
  await requester.getByLabel('Message (optional)').fill('Surgery at district hospital tomorrow')
  await requester.getByRole('button', { name: 'Send request' }).click()
  const card = requester.getByRole('region', { name: 'Your requests' })
  await expect(card.getByText('O+ blood near Sitapur')).toBeVisible()
  await expect(card.getByText('No donor has said yes yet.')).toBeVisible()
  await expect(card.getByText('00000 00001')).toHaveCount(0)

  // Donor sees it and accepts.
  await donor.getByRole('button', { name: 'Refresh' }).click()
  await expect(donor.getByText('Surgery at district hospital tomorrow')).toBeVisible()
  await donor.getByRole('button', { name: 'Yes, share my number' }).click()
  await expect(donor.getByText('You said yes; your number was shared')).toBeVisible()

  // Now the requester gets the number, and can close the request.
  await card.getByRole('button', { name: 'Refresh' }).click()
  await expect(card.getByText('Donors who said yes: 1')).toBeVisible()
  await expect(card.getByText('00000 00001')).toBeVisible()
  await expect(card.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:0000000001')
  await card.getByRole('button', { name: 'Close request' }).click()
  await expect(card.getByText('Closed')).toBeVisible()

  // A closed request disappears for donors; the donor can then leave, which erases their number.
  await donor.getByRole('button', { name: 'Refresh' }).click()
  await expect(donor.getByText('Surgery at district hospital tomorrow')).toHaveCount(0)
  await donor.getByRole('button', { name: 'Stop being a donor' }).click()
  await donor.getByRole('button', { name: 'Yes, remove my number' }).click()
  await expect(donor.getByRole('button', { name: 'Join as a donor' })).toBeVisible()

  await donorContext.close()
  await requesterContext.close()
})

test('sending a request without internet says so and saves nothing', async ({ page }) => {
  await page.goto('/donors/')
  await page.evaluate(() => localStorage.setItem('lang', 'en'))
  await page.reload()
  await page.route('http://localhost:8000/**', (route) => route.abort('internetdisconnected'))
  await page.getByLabel('Blood group').selectOption('B-')
  await page.getByLabel('Near').selectOption('rampur')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('This needs the internet. Connect and try again.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your requests' })).toHaveCount(0)
})
