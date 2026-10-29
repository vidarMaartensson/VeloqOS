import { defineConfig, devices } from '@playwright/test';

// The e2e tests mock /api with page.route (see e2e/fixtures.ts), so only the web dev server runs.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1100 },
    timezoneId: 'Europe/Stockholm',
    locale: 'sv-SE',
    // Orbs float forever; reduced motion also checks that the app honours the setting.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
