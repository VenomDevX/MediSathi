// Renders a SYNTHETIC lab report to content/samples for OCR tests and demos. No real patient data.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const rows = [
  ['Haemoglobin (Hb)', '9.8', 'g/dL', '12.0 - 15.5'],
  ['Total Leucocyte Count', '7800', '/cumm', '4000 - 11000'],
  ['Platelet Count', '1.4', 'lakhs/cumm', '1.5 - 4.5'],
  ['Fasting Blood Sugar', '126', 'mg/dL', '70 - 99'],
  ['Total Cholesterol', '182', 'mg/dL', '< 200'],
  ['TSH', '2.1', 'mIU/L', '0.4 - 4.0'],
]
const html = `<body style="margin:0;padding:48px;width:900px;font:22px Arial;color:#111;background:#fff">
<h1 style="font-size:30px;margin:0">CITY DIAGNOSTICS LAB, SITAPUR</h1>
<p style="margin:8px 0 28px">Patient: Kamla Yadav &nbsp; Age/Sex: 27/F &nbsp; Date: 18-10-2026 &nbsp; (SAMPLE, SYNTHETIC)</p>
<table style="width:100%;border-collapse:collapse;font-size:22px">
<tr style="text-align:left;border-bottom:2px solid #111"><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th></tr>
${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:12px 0">${c}</td>`).join('')}</tr>`).join('')}
</table></body>`
const browser = await chromium.launch()
// ~250 dpi, like a phone photo or office scan
const page = await browser.newPage({ viewport: { width: 996, height: 700 }, deviceScaleFactor: 2.5 })
await page.setContent(html)
await page.screenshot({ path: fileURLToPath(new URL('../../content/samples/sample-lab-report.png', import.meta.url)), fullPage: true })
await browser.close()
