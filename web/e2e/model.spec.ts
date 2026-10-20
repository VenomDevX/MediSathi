import { expect, test, type Page } from '@playwright/test'

const answer = (text: string) => text.match(/.{1,6}/g)!.map((c) => JSON.stringify({ message: { content: c }, done: false }) + '\n').join('') + '{"done":true}\n'

/** A fake Ollama with Gemma 3n E2B installed that always replies with `text`. Returns the questions it was sent. */
async function fakeOllama(page: Page, text: string) {
  const asked: string[] = []
  await page.route('http://localhost:11434/api/tags', (r) => r.fulfill({ json: { models: [{ name: 'gemma3n:e2b' }] } }))
  await page.route('http://localhost:11434/api/chat', (r) => {
    asked.push(r.request().postDataJSON().messages.at(-1).content)
    return r.fulfill({ contentType: 'application/x-ndjson', body: answer(text) })
  })
  return asked
}

async function ask(page: Page, question: string) {
  await page.goto('/chat/')
  await page.evaluate(() => localStorage.setItem('lang', 'en'))
  await page.reload()
  const box = page.getByRole('textbox', { name: 'Type your question…' })
  await box.fill(question)
  await box.press('Enter')
}

test('Gemma explains library items in its own words, with the sources', async ({ page }) => {
  const asked = await fakeOllama(page, '* Let your child rest and drink plenty of water. [1]')
  await ask(page, 'my child has a fever')
  await expect(page.getByText('Let your child rest and drink plenty of water. [1]')).toBeVisible()
  await expect(page.getByText('Explained by Gemma on this device, using only the sources below.')).toBeVisible()
  await expect(page.getByRole('link', { name: /What to do for a fever/ })).toBeVisible()
  expect(asked[0]).toContain('[1] What to do for a fever') // the model is given the library item, numbered
})

test('a model answer that invents a dose is replaced by the library words', async ({ page }) => {
  const asked = await fakeOllama(page, '* Give 500 mg paracetamol every 2 hours. [1]')
  await ask(page, 'my child has a fever')
  await expect(page.getByText('This answer is taken directly from the app library.')).toBeVisible()
  await expect(page.getByText(/500 mg/)).toHaveCount(0)
  expect(asked).toHaveLength(1)
})

test('emergencies never reach the model', async ({ page }) => {
  const asked = await fakeOllama(page, 'anything [1]')
  await ask(page, 'snake bite')
  await expect(page.getByRole('alert').filter({ hasText: 'This may be an emergency' })).toBeVisible()
  expect(asked).toEqual([])
})

test('More shows the model status, and turning it off answers from the library', async ({ page }) => {
  const asked = await fakeOllama(page, '* Rest. [1]')
  await page.goto('/more/')
  await page.getByRole('radio', { name: 'English' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ready: Gemma 3n E2B' })).toBeVisible()
  await page.getByRole('radio', { name: 'Off' }).click()

  await ask(page, 'my child has a fever')
  await expect(page.getByText('This answer is taken directly from the app library.')).toBeVisible()
  expect(asked).toEqual([])
})
