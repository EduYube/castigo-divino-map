import { execFileSync } from 'node:child_process';

const files = [
  'src/data-access/geographicCoverageContract.js',
  'src/data-access/geographicCoverageContract.test.ts',
  'src/data-access/geographicCoverageManifest.d.ts',
  'src/data-access/geographicCoverageManifest.js',
];

execFileSync(
  'node',
  ['node_modules/prettier/bin/prettier.cjs', '--write', ...files],
  { stdio: 'inherit' },
);
execFileSync('git', ['diff', '--', ...files], { stdio: 'inherit' });

process.exitCode = 1;
