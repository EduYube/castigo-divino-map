import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const directory = 'tests/e2e';
const files = (await readdir(directory)).filter((name) => name.endsWith('.spec.ts'));
const changed = [];

for (const name of files) {
  const path = `${directory}/${name}`;
  let source = await readFile(path, 'utf8');
  const original = source;

  source = source
    .replaceAll('/rpc/admin_get_map_entity_editor_v4', '/rpc/admin_get_map_entity_editor_v5')
    .replaceAll('/rpc/admin_save_map_entity_v4', '/rpc/admin_save_map_entity_v5')
    .replaceAll('rpc/admin_get_map_entity_editor_v4', 'rpc/admin_get_map_entity_editor_v5')
    .replaceAll('rpc/admin_save_map_entity_v4', 'rpc/admin_save_map_entity_v5')
    .replaceAll('/rest/v1/rpc/admin_get_master_catalog_v3', '/rest/v1/rpc/admin_get_master_catalog_v4')
    .replaceAll('rpc/admin_get_master_catalog_v3', 'rpc/admin_get_master_catalog_v4');

  source = source.replace(/\{[^{}]*\}/gs, (block) => {
    if (
      block.includes('display_name:') &&
      block.includes("publication_status: 'published'") &&
      !block.includes('accent_color:')
    ) {
      const closing = block.lastIndexOf('}');
      const before = block.slice(0, closing).trimEnd();
      const separator = before.endsWith(',') ? '' : ',';
      return `${before}${separator}\n      accent_color: '#475569',\n    }`;
    }
    return block;
  });

  source = source.replace(
    /(\n\s*dispositions:\s*\[\],)(\n\s*relations:\s*\[\],)/g,
    (match, dispositions, relations) =>
      match.includes('associations:')
        ? match
        : `${dispositions}\n    associations: [],${relations}`,
  );

  if (source !== original) {
    await writeFile(path, source);
    changed.push(path);
  }
}

console.log(`MAP-058 aligned ${changed.length} E2E file(s):`);
changed.forEach((path) => console.log(`- ${path}`));

console.log('\nRemaining legacy RPC references in tests/e2e:');
try {
  const output = execFileSync(
    'grep',
    [
      '-RInE',
      'admin_get_map_entity_editor_v4|admin_save_map_entity_v4|admin_get_master_catalog_v3',
      directory,
      '--include=*.spec.ts',
    ],
    { encoding: 'utf8' },
  );
  process.stdout.write(output);
  process.exitCode = 2;
} catch (error) {
  if (error?.status === 1) console.log('(none)');
  else throw error;
}
