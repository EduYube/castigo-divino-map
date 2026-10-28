import { spawnSync } from 'node:child_process';
import { renameSync } from 'node:fs';

const migration = new URL(
  '../supabase/migrations/20261021095215_harden_explicit_data_api_grants.sql',
  import.meta.url,
);
const hidden = new URL(
  '../supabase/migrations/20261021095215_harden_explicit_data_api_grants.sql.rehearsal-hidden',
  import.meta.url,
);

// Existing upgrade rehearsals deliberately stop at historical migration
// checkpoints. The new hardening migration must only participate in the
// full fresh reset that follows this suite, not those older checkpoints.
const map077Migration = new URL(
  '../supabase/migrations/20261026154700_add_campaign_geographic_map_context_links.sql',
  import.meta.url,
);
const map077Hidden = new URL(
  '../supabase/migrations/20261026154700_add_campaign_geographic_map_context_links.sql.rehearsal-hidden',
  import.meta.url,
);

const rehearsals = [
  'supabase:db:test:upgrade',
  'supabase:db:test:map066:upgrade',
  'supabase:db:test:map054:upgrade',
  'supabase:db:test:map068:upgrade',
  'supabase:db:test:map069:upgrade',
  'supabase:db:test:map075:upgrade',
  'supabase:db:test:map063:upgrade',
  'supabase:db:test:map064:upgrade',
];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

renameSync(migration, hidden);
renameSync(map077Migration, map077Hidden);
try {
  for (const rehearsal of rehearsals) {
    const result = spawnSync(npm, ['run', rehearsal], {
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Historical rehearsal failed: ${rehearsal}`);
    }
  }
} finally {
  // Always restore the canonical migration, even after a failed rehearsal.
  renameSync(map077Hidden, map077Migration);
  renameSync(hidden, migration);
}
