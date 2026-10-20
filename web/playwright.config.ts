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
  webServer: [
    { command: 'npx serve out -l 4200 --no-clipboard', url: 'http://localhost:4200', reuseExistingServer: true },
    {
      // Throwaway in-memory API for the blood request specs (e2e/donors.spec.ts).
      command: `${process.platform === 'win32' ? '.venv\\Scripts\\python' : '.venv/bin/python'} -m uvicorn app.main:app --port 8010`,
      cwd: '../backend',
      url: 'http://localhost:8010/api/v1/health',
      reuseExistingServer: false,
      env: { DATABASE_URL: 'sqlite://', MEDISAATHI_SECRET: 'e2e-secret-not-for-production-0123456789' },
    },
  ],
})
