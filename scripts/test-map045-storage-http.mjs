import { execFileSync } from 'node:child_process';

const ENTITY_ID = 'entity-aster-guide';
const PORTRAIT_PATH = 'portraits/04504504-5045-4045-8045-045045045045.png';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function normalizeStatusKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function collectStatusValues(value, values = new Map()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return values;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.length > 0) {
      values.set(normalizeStatusKey(key), entry);
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      collectStatusValues(entry, values);
    }
  }
  return values;
}

function parseSupabaseStatus(output) {
  const trimmed = output.trim();
  try {
    return collectStatusValues(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return collectStatusValues(JSON.parse(trimmed.slice(start, end + 1)));
    }
    throw new Error('Supabase local no devolvió un estado JSON válido.');
  }
}

function parseSupabaseEnvironment(output, values = new Map()) {
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2]?.trim() ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function required(values, ...names) {
  for (const name of names) {
    const value = values.get(name);
    if (value) return value;
  }
  throw new Error(`Supabase local no expuso ${names.join(' / ')}.`);
}

async function expectResponse(response, label, expectedOk) {
  if (response.ok === expectedOk) return response;
  const body = await response.text().catch(() => '');
  throw new Error(`${label}: HTTP ${response.status}${body ? ` (${body.slice(0, 180)})` : ''}`);
}

async function main() {
  const status = parseSupabaseStatus(
    execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
  parseSupabaseEnvironment(
    execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
    status,
  );

  const apiUrl = required(status, 'API_URL', 'SUPABASE_URL').replace(/\/$/, '');
  const publishableKey = required(status, 'PUBLISHABLE_KEY', 'ANON_KEY', 'SUPABASE_ANON_KEY');
  const privilegedKey = required(
    status,
    'SECRET_KEY',
    'SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  const usesOpaquePublishableKey = publishableKey.startsWith('sb_publishable_');
  const usesOpaquePrivilegedKey = privilegedKey.startsWith('sb_secret_');
  const publicHeaders = {
    apikey: publishableKey,
    ...(usesOpaquePublishableKey ? {} : { Authorization: `Bearer ${publishableKey}` }),
  };
  const privilegedAuthHeaders = {
    apikey: privilegedKey,
    ...(usesOpaquePrivilegedKey ? {} : { Authorization: `Bearer ${privilegedKey}` }),
  };
  const privilegedHeaders = {
    ...privilegedAuthHeaders,
    'Content-Type': 'application/json',
  };

  const entityUrl = new URL(`${apiUrl}/rest/v1/map_entities`);
  entityUrl.searchParams.set('id', `eq.${ENTITY_ID}`);
  entityUrl.searchParams.set('select', 'portrait_path,audience,publication_status');

  const originalResponse = await expectResponse(
    await fetch(entityUrl, { headers: privilegedAuthHeaders }),
    'leer fixture MAP-045',
    true,
  );
  const originalRows = await originalResponse.json();
  const original = originalRows[0];
  if (!original) throw new Error(`No existe el fixture ${ENTITY_ID}.`);

  const objectUrl = `${apiUrl}/storage/v1/object/character-portraits/${PORTRAIT_PATH}`;
  const authenticatedObjectUrl = `${apiUrl}/storage/v1/object/authenticated/character-portraits/${PORTRAIT_PATH}`;
  const collectionUrl = `${apiUrl}/storage/v1/object/character-portraits`;

  const patchEntity = async (patch) => {
    await expectResponse(
      await fetch(`${apiUrl}/rest/v1/map_entities?id=eq.${encodeURIComponent(ENTITY_ID)}`, {
        method: 'PATCH',
        headers: { ...privilegedHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      }),
      'actualizar fixture MAP-045',
      true,
    );
  };

  const deleteObject = async () => {
    await fetch(collectionUrl, {
      method: 'DELETE',
      headers: privilegedHeaders,
      body: JSON.stringify({ prefixes: [PORTRAIT_PATH] }),
    }).catch(() => undefined);
  };

  try {
    await deleteObject();
    await expectResponse(
      await fetch(objectUrl, {
        method: 'POST',
        headers: {
          ...privilegedAuthHeaders,
          'Content-Type': 'image/png',
          'x-upsert': 'false',
        },
        body: PNG,
      }),
      'subir retrato fixture MAP-045',
      true,
    );

    await patchEntity({
      portrait_path: PORTRAIT_PATH,
      audience: 'public',
      publication_status: 'published',
    });

    const publicRead = await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: publicHeaders }),
      'lectura pública de retrato en bucket privado',
      true,
    );
    if (!(publicRead.headers.get('content-type') ?? '').startsWith('image/png')) {
      throw new Error('La lectura pública no devolvió el MIME raster esperado.');
    }

    await patchEntity({ audience: 'master' });
    await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: publicHeaders }),
      'revocación public → master',
      false,
    );

    await patchEntity({ audience: 'public' });
    await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: publicHeaders }),
      'habilitación master → public',
      true,
    );

    await patchEntity({ publication_status: 'draft' });
    await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: publicHeaders }),
      'draft no público',
      false,
    );

    await patchEntity({ publication_status: 'archived' });
    await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: publicHeaders }),
      'archived no público',
      false,
    );

    console.log(
      `MAP-045 Storage HTTP: OK (${usesOpaquePublishableKey ? 'publishable apikey-only' : 'legacy anon JWT'} / ${usesOpaquePrivilegedKey ? 'secret apikey-only' : 'legacy service_role JWT'}).`,
    );
  } finally {
    await patchEntity({
      portrait_path: original.portrait_path ?? null,
      audience: original.audience,
      publication_status: original.publication_status,
    }).catch(() => undefined);
    await deleteObject();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
