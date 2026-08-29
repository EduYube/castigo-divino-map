import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/infrastructure/supabase/publicCatalogCodec.ts';
let source = await readFile(path, 'utf8');
const obsolete = `  const calculatedChecksum = await createSha256Checksum(content);\n\n  if (checksum !== calculatedChecksum) {\n    throw new PublicDataRepositoryError(\n      'checksum-mismatch',\n      'La caché pública no coincide con su checksum.',\n      { source: 'cache' },\n    );\n  }\n\n`;

if (source.includes(obsolete)) {
  source = source.replace(obsolete, '');
  await writeFile(path, source);
} else if (!source.includes('const checksumContent = Object.fromEntries(')) {
  throw new Error('Expected raw checksum verification block was not found.');
}

console.log('MAP-058 removed post-normalization checksum verification.');
