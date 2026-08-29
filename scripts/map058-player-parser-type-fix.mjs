import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/infrastructure/supabase/publicCatalogRows.ts';
let source = await readFile(path, 'utf8');

const typeAnchor = "export function parsePlayer(row: Record<string, unknown>, index: number): PublicPlayer {";
const replacement = "export type ParsedPublicPlayer = PublicPlayer & { readonly accentColor: string };\n\nexport function parsePlayer(\n  row: Record<string, unknown>,\n  index: number,\n): ParsedPublicPlayer {";

if (!source.includes(replacement)) {
  if (!source.includes(typeAnchor)) throw new Error('parsePlayer signature anchor not found');
  source = source.replace(typeAnchor, replacement);
  await writeFile(path, source);
}

console.log('MAP-058 parsePlayer return type narrowed to its validated runtime contract.');
