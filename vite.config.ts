import { defineConfig } from 'vite';

type ViteBaseEnvironment = {
  readonly GITHUB_REPOSITORY?: string;
  readonly npm_package_name?: string;
};

function getRepositoryName(environment: ViteBaseEnvironment): string | null {
  const repository = environment.GITHUB_REPOSITORY?.trim();
  const packageName = environment.npm_package_name?.trim();
  const repositoryName = repository?.split('/').at(-1) ?? packageName;

  if (!repositoryName || !/^[a-zA-Z0-9._-]+$/.test(repositoryName)) {
    return null;
  }

  return repositoryName;
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
}));
