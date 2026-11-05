// Temporary MAP-080 CI-only formatting export; remove before review R2.
import { readFileSync } from 'node:fs';
for (const path of [
  'src/infrastructure/supabase/publicCatalogRepository.test.ts',
  'tests/e2e/map080-degraded.spec.ts',
  'tests/e2e/map080-master-local-revocation.spec.ts',
  'scripts/public-snapshot-lib.mjs',
]) {
  console.log('MAP080_FMT_BEGIN:' + path);
  console.log(readFileSync(path).toString('base64'));
  console.log('MAP080_FMT_END:' + path);
}
