import { readFile } from 'node:fs/promises';

import { defineConfig, type Plugin } from 'vite';

type ViteBaseEnvironment = {
  readonly GITHUB_REPOSITORY?: string;
  readonly npm_package_name?: string;
};

const E2E_PUBLIC_SNAPSHOT_URL = new URL(
  './tests/e2e/fixtures/public-catalog.demo.snapshot.json',
  import.meta.url,
);

function getRepositoryName(environment: ViteBaseEnvironment): string | null {
  const repository = environment.GITHUB_REPOSITORY?.trim();
  const packageName = environment.npm_package_name?.trim();
  const repositoryName = repository?.split('/').at(-1) ?? packageName;

  if (!repositoryName || !/^[a-zA-Z0-9._-]+$/.test(repositoryName)) {
    return null;
  }

  return repositoryName;
}

function createE2ePublicSnapshotPlugin(): Plugin {
  return {
    name: 'e2e-public-catalog-fixture',
    configureServer(server) {
      server.middlewares.use(
        '/data/public-catalog.snapshot.json',
        async (_request, response, next) => {
          try {
            const fixture = await readFile(E2E_PUBLIC_SNAPSHOT_URL, 'utf8');

            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(fixture);
          } catch (error) {
            next(error);
          }
        },
      );
    },
  };
}

export function resolveViteBase(
  mode: string,
  environment: ViteBaseEnvironment = process.env,
): string {
  if (mode !== 'pages') {
    return '/';
  }

  const repositoryName = getRepositoryName(environment);

  if (!repositoryName) {
    throw new Error(
      'GitHub Pages builds require GITHUB_REPOSITORY or npm_package_name to derive the base path.',
    );
  }

  return `/${repositoryName}/`;
}

export default defineConfig(({ mode }) => ({
  base: resolveViteBase(mode),
  plugins: mode === 'e2e' ? [createE2ePublicSnapshotPlugin()] : [],
}));
