import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

// A fake on-device recogniser that "hears" the queued phrases, and a speech engine that records what it says.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { heard: string[]; spoken: string[]; SpeechRecognition: unknown; SpeechSynthesisUtterance: unknown }
    w.heard = []
    w.spoken = []
    class FakeRecognition {
      static available = async () => 'available'
      lang = ''
      onresult = (_: unknown) => {}
      onend = () => {}
      onerror = (_: unknown) => {}
      start() {
        setTimeout(() => {
          const phrase = w.heard.shift()
          if (phrase) this.onresult({ results: [[{ transcript: phrase }]] })
          else this.onerror({ error: 'no-speech' })
          this.onend()
        }, 50)
      }
      stop() {}
    }
    w.SpeechRecognition = FakeRecognition
    w.SpeechSynthesisUtterance = class { lang = ''; rate = 1; voice = null; onend = () => {}; onerror = () => {}; constructor(public text: string) {} }
    // Chrome's speechSynthesis is a read-only getter, so it is redefined rather than assigned.
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [],
      cancel: () => {},
      speak: (u: { text: string; onend: () => void }) => {
        w.spoken.push(u.text)
        setTimeout(() => u.onend(), 20)
      },
    } })
  })
})

test('Saathi answers aloud, listens again, and stops at an emergency', async ({ page, context }) => {
  await openApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.evaluate(() => ((window as unknown as { heard: string[] }).heard = ['bacche ko bukhar hai', 'saanp ne kaata']))

  await page.getByRole('link', { name: /Hands-free/ }).click()
  await page.getByRole('button', { name: 'Start talking' }).click()

  const spoken = () => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)
  await expect.poll(async () => (await spoken()).length).toBe(2)
  const [fever, snake] = await spoken()
  expect(fever).toMatch(/Rest and drink plenty of water/)
  expect(snake).toMatch(/Call 108\. The nearest health centre is Sitapur District Hospital/) // open 24 hours, from Rampur
  await expect(page.getByRole('link', { name: 'Call 108' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start talking' })).toBeVisible() // stopped after the emergency

  // The conversation is saved in Ask history
  await page.goto('/#/chat')
  await expect(page.getByRole('link', { name: 'bacche ko bukhar hai' })).toBeVisible()
})

test('Saathi stops after two silent turns', async ({ page }) => {
  await openApp(page)
  await page.goto('/#/saathi')
  await page.getByRole('button', { name: 'Start talking' }).click()
  await expect(page.getByText(/Didn't catch/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start talking' })).toBeVisible()
})
