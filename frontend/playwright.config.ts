import { defineConfig, devices } from '@playwright/test'

// E2E runs against the production build so the service worker and offline mode are real.
// Own port: 4173 (vite's default) is often taken by another preview, which reuseExistingServer would silently test instead.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4319', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    { command: 'npx vite preview --port 4319 --strictPort', url: 'http://localhost:4319', reuseExistingServer: true },
    {
      // Real API for the sync journey: fresh SQLite file per run, demo users seeded from content/.
      command: `${process.platform === 'win32' ? '.venv\\Scripts\\python' : '.venv/bin/python'} -m uvicorn app.main:app --port 8000`,
      cwd: '../backend',
      url: 'http://localhost:8000/api/v1/health',
      reuseExistingServer: true,
      env: { MEDISAATHI_SECRET: 'e2e-only-secret-0123456789abcdefghijklmnop', DATABASE_URL: 'sqlite:///./e2e.db', DEMO_PASSWORD: 'demo-1234', CORS_ORIGINS: 'http://localhost:4319' },
    },
  ],
})
