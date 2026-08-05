import { spawnSync } from 'node:child_process';

const NETWORK_NAME = 'castigo-divino-map-local';
const BIND_OPTION = 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1';

function runDocker(args, options = {}) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    windowsHide: true,
  });
}

const inspect = runDocker(['network', 'inspect', NETWORK_NAME]);

if (inspect.status === 0) {
  console.log(`Docker network ${NETWORK_NAME} already exists.`);
  process.exit(0);
}

const create = runDocker(
  ['network', 'create', '--driver', 'bridge', '--opt', BIND_OPTION, NETWORK_NAME],
  { inherit: true },
);

if (create.error) {
  console.error(`Unable to run Docker: ${create.error.message}`);
  process.exit(1);
}

if (create.status !== 0) {
  console.error(`Unable to create Docker network ${NETWORK_NAME}.`);
  process.exit(create.status ?? 1);
}

console.log(`Created Docker network ${NETWORK_NAME} bound to localhost.`);
