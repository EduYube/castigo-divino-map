// Temporary, source-only CI formatting handoff. Removed in the next commit.
import { readFileSync } from 'node:fs';
const paths = ["src/domain/adminLocalMaps.ts","src/infrastructure/supabase/adminLocalMapRepository.ts","src/map/adminLocalMapEditor.ts","src/app/adminLocalMaps.ts","src/domain/adminLocalMaps.test.ts","tests/e2e/map078-local-admin.spec.ts","src/app/adminAuthRuntime.ts","src/app/adminCampaignScope.ts","src/app/adminCampaignScope.test.ts"];
for (const path of paths) {
  process.stdout.write('MAP078_B64_BEGIN:'+path+'\n');
  process.stdout.write(readFileSync(path).toString('base64')+'\n');
  process.stdout.write('MAP078_B64_END:'+path+'\n');
}
