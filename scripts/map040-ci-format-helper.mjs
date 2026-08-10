import { readFile, writeFile } from 'node:fs/promises';

import prettier from 'prettier';

const files = [
  'src/data-access/geographicSpanishReviewContract.d.ts',
  'src/data-access/geographicSpanishReviewContract.js',
  'src/data-access/geographicSpanishReviewManifest.js',
  'src/data/beta02-model.ts',
  'src/data/search.map040.test.ts',
  'src/infrastructure/supabase/publicCatalogRows.ts',
  'scripts/verify-public-snapshot.mjs',
];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const config = (await prettier.resolveConfig(file)) ?? {};
  const formatted = await prettier.format(source, {
    ...config,
    filepath: file,
    endOfLine: 'auto',
  });
  await writeFile(file, formatted, 'utf8');
  console.log(`MAP040_FORMATTED_BEGIN:${file}`);
  console.log(formatted);
  console.log(`MAP040_FORMATTED_END:${file}`);
}
