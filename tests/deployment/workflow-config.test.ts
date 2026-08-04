import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const readText = (path: string) => readFile(path, 'utf8');

describe('GitHub Pages deployment contracts', () => {
  it('runs CI for pull requests and integrated master commits', async () => {
    const workflow = await readText('.github/workflows/ci.yml');

    expect(workflow).toMatch(/pull_request:[\s\S]*branches:[\s\S]*- master/);
    expect(workflow).toMatch(/push:[\s\S]*branches:[\s\S]*- master/);
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run build:pages');
    expect(workflow).toContain('npm run verify:build');
    expect(workflow).toContain('playwright.pages.config.ts');
  });

  it('deploys only successful master validation through the official Pages actions', async () => {
    const workflow = await readText('.github/workflows/pages.yml');

    expect(workflow).toMatch(/workflow_run:[\s\S]*workflows:[\s\S]*- CI/);
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'master'");
    expect(workflow).toContain("github.ref == 'refs/heads/master'");
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('actions/configure-pages@v6');
    expect(workflow).toContain('actions/upload-pages-artifact@v5');
    expect(workflow).toContain('path: dist');
    expect(workflow).toContain('actions/deploy-pages@v5');
    expect(workflow).toContain('environment:');
    expect(workflow).toContain('name: github-pages');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('PAGES_URL: ${{ needs.deploy.outputs.page_url }}');
    expect(workflow).not.toContain('Sword-Coast-Map_LowRes.jpg');
  });

  it('keeps Pages build and preview commands explicit', async () => {
    const packageJson = JSON.parse(await readText('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['build:pages']).toContain('vite build --mode pages');
    expect(packageJson.scripts['preview:pages']).toContain('vite preview --mode pages');
    expect(packageJson.scripts['verify:build']).toBe('node verify-production-build.mjs');
  });
});
