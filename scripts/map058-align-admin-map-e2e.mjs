import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const path = 'tests/e2e/admin-map-entities.spec.ts';
let source = await readFile(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  source = source.replace(before, after);
};

replaceOnce(
  `  const players = [\n    { id: 'player-skade', display_name: 'Skade', publication_status: 'published' },\n    { id: 'player-ura', display_name: 'Ura', publication_status: 'published' },\n    { id: 'player-veyra', display_name: 'Veyra', publication_status: 'published' },\n  ];`,
  `  const players = [\n    {\n      id: 'player-skade',\n      display_name: 'Skade',\n      publication_status: 'published',\n      accent_color: '#c2410c',\n    },\n    {\n      id: 'player-ura',\n      display_name: 'Ura',\n      publication_status: 'published',\n      accent_color: '#1e3a8a',\n    },\n    {\n      id: 'player-veyra',\n      display_name: 'Veyra',\n      publication_status: 'published',\n      accent_color: '#9d174d',\n    },\n  ];`,
  'player accent fixtures',
);

replaceOnce(
  `      dispositions: players.map((player) => ({\n        player_id: player.id,\n        display_name: player.display_name,\n        disposition: currentDispositions[player.id] ?? 'neutral',\n        updated_at: entity.updated_at,\n      })),\n      relations_revision: relationRevision(id),`,
  `      dispositions: players.map((player) => ({\n        player_id: player.id,\n        display_name: player.display_name,\n        disposition: currentDispositions[player.id] ?? 'neutral',\n        updated_at: entity.updated_at,\n      })),\n      associations: [],\n      relations_revision: relationRevision(id),`,
  'editor associations',
);

replaceOnce(
  `        location_events: 0,\n        requests: 0,\n      },`,
  `        location_events: 0,\n        requests: 0,\n        player_associations: 0,\n      },`,
  'association delete blocker',
);

replaceOnce(
  `                    .map(({ id, display_name }) => ({\n                      id,\n                      slug: id,\n                      display_name,\n                      name_language: 'en',\n                    }))`,
  `                    .map(({ id, display_name, accent_color }) => ({\n                      id,\n                      slug: id,\n                      display_name,\n                      name_language: 'en',\n                      accent_color,\n                    }))`,
  'public player accent projection',
);

source = source
  .replaceAll('/rpc/admin_get_map_entity_editor_v4', '/rpc/admin_get_map_entity_editor_v5')
  .replaceAll('/rpc/admin_save_map_entity_v4', '/rpc/admin_save_map_entity_v5');

await writeFile(path, source);

console.log('MAP-058 aligned admin-map-entities E2E with v5 associations and player accents.');
console.log('\nRemaining legacy RPC references in tests/e2e:');
try {
  const output = execFileSync(
    'grep',
    [
      '-RInE',
      'admin_get_map_entity_editor_v4|admin_save_map_entity_v4|admin_get_master_catalog_v3',
      'tests/e2e',
      '--include=*.spec.ts',
    ],
    { encoding: 'utf8' },
  );
  process.stdout.write(output);
} catch (error) {
  if (error?.status === 1) console.log('(none)');
  else throw error;
}
