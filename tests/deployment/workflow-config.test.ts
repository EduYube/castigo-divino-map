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
    expect(workflow).toContain('npm run test:e2e:pages');
  });

  it('deploys only successful master validation through immutable official Pages actions', async () => {
    const workflow = await readText('.github/workflows/pages.yml');

    expect(workflow).toMatch(/workflow_run:[\s\S]*workflows:[\s\S]*- CI/);
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'master'");
    expect(workflow).toContain("github.ref == 'refs/heads/master'");
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain(
      'actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6',
    );
    expect(workflow).toContain(
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5',
    );
    expect(workflow).toContain('path: dist');
    expect(workflow).toContain(
      'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5',
    );
    expect(workflow).not.toMatch(/uses:\s+actions\/[\w-]+@v\d+/u);
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
