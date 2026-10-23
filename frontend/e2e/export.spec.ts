import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('a family member\'s record exports offline as an ABDM FHIR bundle with ABHA number and vaccines', async ({ page, context }) => {
  await openApp(page, 'en', 'citizen')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)

  await page.goto('/#/family/new')
  await page.getByLabel('Name').fill('Munni')
  await page.getByLabel('Relation').selectOption('child')
  await page.getByLabel('Date of birth').fill(new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10))
  await page.getByLabel('ABHA number (if any)').fill('91 2345 6789 0123')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('91-2345-6789-0123')).toBeVisible()
  await page.getByRole('button', { name: 'Given today: BCG' }).click()
  await expect(page.getByText('1 given')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export health record (ABDM FHIR)' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^Munni-health-record-\d{4}-\d{2}-\d{2}\.json$/)
  const bundle = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'collection' })
  const types = bundle.entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType)
  expect(types).toEqual(['Patient', 'Immunization', 'Encounter'])
  expect(bundle.entry[0].resource.identifier[0]).toMatchObject({ system: 'https://healthid.ndhm.gov.in', value: '91-2345-6789-0123' })
  expect(bundle.entry[1].resource.vaccineCode.text).toBe('BCG')
})

test('a patient record exports for the health worker', async ({ page }) => {
  await openApp(page)
  await page.goto('/#/patients/p-0011')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export health record (ABDM FHIR)' }).click()
  const bundle = JSON.parse(await readFile((await (await download).path())!, 'utf8'))
  const doses = bundle.entry.filter((e: { resource: { resourceType: string } }) => e.resource.resourceType === 'Immunization')
  expect(doses.map((e: { resource: { vaccineCode: { text: string } } }) => e.resource.vaccineCode.text)).toEqual(['BCG', 'OPV-0 (polio drops)', 'Hepatitis B birth dose'])
})
