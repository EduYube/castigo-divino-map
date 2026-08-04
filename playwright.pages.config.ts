import { defineConfig, devices } from '@playwright/test';

function getRepositoryName(): string {
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const packageName = process.env.npm_package_name?.trim();
  const repositoryName = repository?.split('/').at(-1) ?? packageName;

  if (!repositoryName || !/^[a-zA-Z0-9._-]+$/.test(repositoryName)) {
    throw new Error('A safe repository name is required for the GitHub Pages smoke tests.');
  }

  return repositoryName;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

const repositoryName = getRepositoryName();
const deployedUrl = process.env.PAGES_URL?.trim();
const baseURL = normalizeBaseUrl(deployedUrl || `http://127.0.0.1:4174/${repositoryName}/`);

export default defineConfig({
  testDir: './tests/deployment',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'pages-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: deployedUrl
    ? undefined
    : {
        command: 'npm run preview:pages -- --host 127.0.0.1 --port 4174',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
