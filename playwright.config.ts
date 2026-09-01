import { defineConfig, devices } from '@playwright/test';

const criticalAccessibilitySuite = /responsive-accessibility\.spec\.ts/;
const mobileOnlySuite = /(map033-mobile|map037-mobile-details|map061-admin-mobile)\.spec\.ts/;
const criticalMobileSuite =
  /(responsive-accessibility|map033-mobile|map037-mobile-details|map038-search-autocomplete|map042-geographic-navigation-pins|map043-public-pin-form|map061-admin-mobile)\.spec\.ts/;
const criticalMap061Suite = /(map061-campaign-regions|map061-master-status-purge)\.spec\.ts/;
const criticalMap061Flow =
  /renders translucent overlapping regions|purges Master region search status/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  preserveOutput: 'always',
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: mobileOnlySuite,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testMatch: criticalAccessibilitySuite,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'firefox-map061',
      testMatch: criticalMap061Suite,
      grep: criticalMap061Flow,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-map061',
      testMatch: criticalMap061Suite,
      grep: criticalMap061Flow,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: criticalMobileSuite,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-webkit',
      testMatch: criticalMobileSuite,
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
