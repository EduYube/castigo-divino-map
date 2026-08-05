export const NETWORK_NAME = 'castigo-divino-map-local';
export const NETWORK_DRIVER = 'bridge';
export const BIND_OPTION_NAME = 'com.docker.network.bridge.host_binding_ipv4';
export const BIND_ADDRESS = '127.0.0.1';
export const BIND_OPTION = `${BIND_OPTION_NAME}=${BIND_ADDRESS}`;

export const RECOVERY_COMMANDS = [
  'npm run supabase:stop',
  `docker network rm ${NETWORK_NAME}`,
  'npm run supabase:start',
];

export function validateNetworkInspection(stdout) {
  let networks;

  try {
    networks = JSON.parse(stdout);
  } catch (error) {
    return {
      ok: false,
      reason: `Docker returned invalid network inspection JSON: ${error.message}`,
    };
  }

  if (!Array.isArray(networks) || networks.length !== 1 || networks[0] === null) {
    return {
      ok: false,
      reason: 'Docker network inspection did not return exactly one network.',
    };
  }

  const network = networks[0];

  if (network.Driver !== NETWORK_DRIVER) {
    return {
      ok: false,
      reason: `Expected Docker network driver ${NETWORK_DRIVER}, received ${String(network.Driver)}.`,
    };
  }

  const binding = network.Options?.[BIND_OPTION_NAME];

  if (binding !== BIND_ADDRESS) {
    return {
      ok: false,
      reason: `Expected ${BIND_OPTION_NAME}=${BIND_ADDRESS}, received ${String(binding)}.`,
    };
  }

  return { ok: true };
}

export function isMissingNetworkError(stderr) {
  return /(?:no such network|network .* not found)/i.test(stderr);
}
