import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ENTITY_ID = 'entity-aster-guide';
const LOCAL_ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const LOCAL_READER_ID = '00000000-0000-4000-8000-000000000002';
const PORTRAIT_PATH = 'portraits/04504504-5045-4045-8045-045045045045.png';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function parseSupabaseEnvironment(output) {
  const values = new Map();
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

function requiredAny(values, ...names) {
  for (const name of names) {
    const value = values.get(name);
    if (value) return value;
  }
  throw new Error(
    `Supabase local no expuso ${names.join(' / ')}. Variables disponibles: ${[...values.keys()].sort().join(', ') || '(ninguna)'}.`,
  );
}

function localApiUrl() {
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  let section = '';
  for (const rawLine of config.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1] ?? '';
      continue;
    }
    if (section !== 'api') continue;
    const portMatch = /^port\s*=\s*(\d+)\s*$/.exec(line);
    if (!portMatch) continue;
    return `http://127.0.0.1:${Number(portMatch[1])}`;
  }
  throw new Error('supabase/config.toml no define [api].port para el entorno local.');
}

function mintLocalAuthenticatedToken(userId) {
  const output = execFileSync(
    'npx',
    ['supabase', 'gen', 'bearer-jwt', '--role', 'authenticated', '--sub', userId],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const token = output.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
  if (!token) throw new Error(`No se pudo generar el JWT local para ${userId}.`);
  return token;
}

async function expectResponse(response, label, expectedOk) {
  if (response.ok === expectedOk) return response;
  const body = await response.text().catch(() => '');
  throw new Error(`${label}: HTTP ${response.status}${body ? ` (${body.slice(0, 180)})` : ''}`);
}

async function expectRasterResponse(response, label) {
  await expectResponse(response, label, true);
  if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
    throw new Error(`${label}: la respuesta no tiene un MIME de imagen.`);
  }
  return response;
}

async function main() {
  const status = parseSupabaseEnvironment(
    execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );

  const apiUrl = localApiUrl();
  const publishableKey = requiredAny(status, 'PUBLISHABLE_KEY', 'ANON_KEY', 'SUPABASE_ANON_KEY');
  const usesOpaquePublishableKey = publishableKey.startsWith('sb_publishable_');
  const publicHeaders = {
    apikey: publishableKey,
    ...(usesOpaquePublishableKey ? {} : { Authorization: `Bearer ${publishableKey}` }),
  };
  const adminAuthHeaders = {
    apikey: publishableKey,
    Authorization: `Bearer ${mintLocalAuthenticatedToken(LOCAL_ADMIN_ID)}`,
  };
  const readerAuthHeaders = {
    apikey: publishableKey,
    Authorization: `Bearer ${mintLocalAuthenticatedToken(LOCAL_READER_ID)}`,
  };
  const adminJsonHeaders = {
    ...adminAuthHeaders,
    'Content-Type': 'application/json',
  };

  const entityUrl = new URL(`${apiUrl}/rest/v1/map_entities`);
  entityUrl.searchParams.set('id', `eq.${ENTITY_ID}`);
  entityUrl.searchParams.set('select', 'portrait_path,audience,publication_status');

  const originalResponse = await expectResponse(
    await fetch(entityUrl, { headers: adminAuthHeaders }),
    'leer fixture MAP-045 como admin autenticado',
    true,
  );
  const originalRows = await originalResponse.json();
  const original = originalRows[0];
  if (!original) throw new Error(`No existe el fixture ${ENTITY_ID}.`);

  const objectUrl = `${apiUrl}/storage/v1/object/character-portraits/${PORTRAIT_PATH}`;
  const authenticatedObjectUrl = `${apiUrl}/storage/v1/object/authenticated/character-portraits/${PORTRAIT_PATH}`;
  const renderUrl = new URL(
    `${apiUrl}/storage/v1/render/image/authenticated/character-portraits/${PORTRAIT_PATH}`,
  );
  renderUrl.searchParams.set('width', '96');
  renderUrl.searchParams.set('height', '96');
  renderUrl.searchParams.set('resize', 'cover');
  renderUrl.searchParams.set('quality', '72');
  const collectionUrl = `${apiUrl}/storage/v1/object/character-portraits`;

  const patchEntity = async (patch) => {
    await expectResponse(
      await fetch(`${apiUrl}/rest/v1/map_entities?id=eq.${encodeURIComponent(ENTITY_ID)}`, {
        method: 'PATCH',
        headers: { ...adminJsonHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      }),
      'actualizar fixture MAP-045 como admin autenticado',
      true,
    );
  };

  const deleteObject = async () => {
    await expectResponse(
      await fetch(collectionUrl, {
        method: 'DELETE',
        headers: adminJsonHeaders,
        body: JSON.stringify({ prefixes: [PORTRAIT_PATH] }),
      }),
      'eliminar retrato MAP-045 como admin autenticado',
      true,
    );
  };

  const uploadHeaders = (headers) => ({
    ...headers,
    'Content-Type': 'image/png',
    'x-upsert': 'false',
  });

  try {
    await deleteObject().catch(() => undefined);

    await expectResponse(
      await fetch(objectUrl, {
        method: 'POST',
        headers: uploadHeaders(publicHeaders),
        body: PNG,
      }),
      'anon no puede subir retratos',
      false,
    );
    await expectResponse(
      await fetch(objectUrl, {
        method: 'POST',
        headers: uploadHeaders(readerAuthHeaders),
        body: PNG,
      }),
      'auth no-admin no puede subir retratos',
      false,
    );
    await expectResponse(
      await fetch(objectUrl, {
        method: 'POST',
        headers: uploadHeaders(adminAuthHeaders),
        body: PNG,
      }),
      'admin puede subir retratos',
      true,
    );

    await patchEntity({
      portrait_path: PORTRAIT_PATH,
      audience: 'public',
      publication_status: 'published',
    });

    await expectRasterResponse(
      await fetch(authenticatedObjectUrl, { headers: publicHeaders }),
      'lectura pública de retrato en bucket privado',
    );
    await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: readerAuthHeaders }),
      'auth no-admin puede leer un retrato público',
      true,
    );
    await expectRasterResponse(
      await fetch(renderUrl, { headers: publicHeaders }),
      'anon puede solicitar el thumbnail transformado del retrato público',
    );

    await patchEntity({ audience: 'master' });
    await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: publicHeaders }),
      'revocación public → master para anon',
      false,
    );
    await expectResponse(
      await fetch(renderUrl, { headers: publicHeaders }),
      'revocación public → master también bloquea el thumbnail transformado',
      false,
    );
    await expectResponse(
      await fetch(authenticatedObjectUrl, { headers: readerAuthHeaders }),
      'auth no-admin no puede leer retrato master',
      false,
    );
    await expectRasterResponse(
      await fetch(authenticatedObjectUrl, { headers: adminAuthHeaders }),
      'admin puede leer retrato master',
    );
    await expectRasterResponse(
      await fetch(renderUrl, { headers: adminAuthHeaders }),
      'admin puede solicitar el thumbnail transformado del retrato master',
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
      `MAP-045 Storage HTTP: OK (${usesOpaquePublishableKey ? 'publishable key' : 'legacy anon key'} + JWTs authenticated locales efímeros + thumbnail transformado).`,
    );
  } finally {
    await patchEntity({
      portrait_path: original.portrait_path ?? null,
      audience: original.audience,
      publication_status: original.publication_status,
    }).catch(() => undefined);
    await deleteObject().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
