import { readFileSync } from 'node:fs';

const expectedVersion = '1.3.0';
const expectedLabel = 'v1.3';
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
);
const renderApp = readFileSync(new URL('../src/app/renderApp.ts', import.meta.url), 'utf8');
const pagesSmoke = readFileSync(
  new URL('../tests/deployment/pages-smoke.spec.ts', import.meta.url),
  'utf8',
);
const projectStatus = readFileSync(new URL('../docs/project-status.md', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Release version verification failed: ${message}`);
  }
}

assert(packageJson.version === expectedVersion, `package.json must be ${expectedVersion}`);
assert(
  packageLock.version === expectedVersion,
  `package-lock.json root must be ${expectedVersion}`,
);
assert(
  packageLock.packages?.['']?.version === expectedVersion,
  `package-lock.json package root must be ${expectedVersion}`,
);
assert(
  renderApp.includes(`release-badge">${expectedLabel}<`),
  `UI badge must declare ${expectedLabel}`,
);
assert(renderApp.includes(`Faerûn · ${expectedLabel}`), `UI eyebrow must declare ${expectedLabel}`);
assert(
  !renderApp.includes('release-badge">v1.0<'),
  'UI badge must not retain v1.0 as current release',
);
assert(pagesSmoke.includes(expectedLabel), 'Pages smoke must assert the current release label');
assert(
  projectStatus.includes(expectedVersion) && projectStatus.includes(expectedLabel),
  'project status must declare both semantic and UI versions',
);

assert(
  projectStatus.startsWith('# Estado del proyecto\n\n## Estado actual — candidata v1.3'),
  'project status must lead with the current v1.3 release candidate',
);
assert(
  projectStatus.includes('## Historial preservado — candidata v1.2 / MAP-074'),
  'project status must preserve historical v1.2 release documentation',
);

console.log(`Release version verification passed: ${expectedVersion} / ${expectedLabel}.`);
