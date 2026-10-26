import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const NON_ADMIN_ID = '00000000-0000-4000-8000-000000000002';

function parseEnvironment(output) {
  const result = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    result.set(match[1], match[2].replace(/^["']|["']$/g, ''));
  }
  return result;
}

function localApiUrl() {
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const section = config.match(/\[api\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const port = section?.match(/^port\s*=\s*(\d+)/m)?.[1];
  if (!port) throw new Error('Missing local Supabase [api].port');
  return `http://127.0.0.1:${Number(port)}`;
}

function mintToken(userId) {
  const output = execFileSync(
    'npx',
    ['supabase', 'gen', 'bearer-jwt', '--role', 'authenticated', '--sub', userId],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const jwtPattern = /eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+/;
  const token = output.match(jwtPattern)?.[0];
  if (!token) throw new Error('Unable to mint local authenticated test token');
  return token;
}

async function requestJson(url, headers, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Unexpected non-JSON HTTP ${response.status} for ${new URL(url).pathname}`);
  }
  return { status: response.status, ok: response.ok, body };
}

async function main() {
  const env = parseEnvironment(
    execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
  const key = env.get('PUBLISHABLE_KEY') ?? env.get('ANON_KEY') ?? env.get('SUPABASE_ANON_KEY');
  if (!key) throw new Error('Missing local publishable / anon key');
  const api = localApiUrl();
  const headers = (token) => ({
    apikey: key,
    Authorization: `Bearer ${token}`,
  });
  const anonHeaders = headers(key);
  const adminHeaders = headers(mintToken(ADMIN_ID));
  const readerHeaders = headers(mintToken(NON_ADMIN_ID));

  for (const table of [
    'map_entities',
    'categories',
    'map_contexts',
    'entity_map_placements',
    'campaign_geographic_map_context_links',
  ]) {
    const result = await requestJson(`${api}/rest/v1/${table}?select=*&limit=1`, anonHeaders);
    if (!result.ok || !Array.isArray(result.body)) {
      throw new Error(`anon ${table}: expected public Data API read, got ${result.status}`);
    }
  }

  // The entrance API is scoped by campaign and map-context publication RLS.
  const neverwinterLinks = await requestJson(
    `${api}/rest/v1/campaign_geographic_map_context_links?select=campaign_id,geographic_name_id,map_contexts!inner(id,slug,publication_status)&campaign_id=eq.00000000-0000-4000-8000-000000000068`,
    anonHeaders,
  );
  if (
    !neverwinterLinks.ok ||
    !Array.isArray(neverwinterLinks.body) ||
    neverwinterLinks.body.length !== 1 ||
    neverwinterLinks.body[0]?.geographic_name_id !== 'geo-neverwinter' ||
    neverwinterLinks.body[0]?.map_contexts?.slug !== 'neverwinter'
  ) {
    throw new Error('MAP-077 public Neverwinter link or map_context join unavailable');
  }
  const castigoLinks = await requestJson(
    `${api}/rest/v1/campaign_geographic_map_context_links?select=campaign_id&campaign_id=eq.00000000-0000-4000-8000-000000000053`,
    anonHeaders,
  );
  if (!castigoLinks.ok || !Array.isArray(castigoLinks.body) || castigoLinks.body.length !== 0) {
    throw new Error('MAP-077 exposed a forbidden Castigo Divino local map link');
  }

  // public_requests has an admin SELECT grant and RLS, but no anon GRANT:
  // missing privileges must fail before the RLS layer with SQLSTATE 42501.
  const denied = await requestJson(`${api}/rest/v1/public_requests?select=id&limit=1`, anonHeaders);
  if (denied.ok || denied.body?.code !== '42501') {
    throw new Error(
      `anon public_requests: expected 42501, got HTTP ${denied.status} / ${denied.body?.code}`,
    );
  }

  const adminRequests = await requestJson(
    `${api}/rest/v1/public_requests?select=id&limit=1`,
    adminHeaders,
  );
  if (!adminRequests.ok || !Array.isArray(adminRequests.body) || adminRequests.body.length === 0) {
    throw new Error('authenticated admin lost access to seeded public requests');
  }

  const nonAdminRequests = await requestJson(
    `${api}/rest/v1/public_requests?select=id&limit=1`,
    readerHeaders,
  );
  if (
    !nonAdminRequests.ok ||
    !Array.isArray(nonAdminRequests.body) ||
    nonAdminRequests.body.length !== 0
  ) {
    throw new Error('authenticated non-admin can see protected public requests');
  }

  for (const [name, authHeaders, expected] of [
    ['admin', adminHeaders, true],
    ['non-admin', readerHeaders, false],
  ]) {
    const probe = await requestJson(`${api}/rest/v1/rpc/current_user_is_admin`, authHeaders, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!probe.ok || probe.body !== expected) {
      throw new Error(`${name} authorization RPC: unexpected HTTP/result ${probe.status}`);
    }
  }
  console.log('INFRA-210 Data API smoke: anon/admin/non-admin/grant boundary PASS');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
