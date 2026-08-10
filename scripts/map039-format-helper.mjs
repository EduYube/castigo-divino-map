import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

for (const file of files) {
  console.log(`MAP039_FILE_BEGIN:${file}`);
  console.log(Buffer.from(readFileSync(file)).toString('base64'));
  console.log(`MAP039_FILE_END:${file}`);
}

process.exitCode = 1;
