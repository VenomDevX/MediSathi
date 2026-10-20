import { defineConfig, devices } from '@playwright/test'

// E2E runs against the static export so the service worker and offline mode are real.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4200', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: { command: 'npx serve out -l 4200 --no-clipboard', url: 'http://localhost:4200', reuseExistingServer: true },
})
