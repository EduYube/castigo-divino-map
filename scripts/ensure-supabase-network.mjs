import { spawnSync } from 'node:child_process';
import {
  BIND_OPTION,
  NETWORK_DRIVER,
  NETWORK_NAME,
  RECOVERY_COMMANDS,
  isMissingNetworkError,
  validateNetworkInspection,
} from './supabase-network.mjs';

function runDocker(args) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });
}

function printDockerFailure(prefix, result) {
  const detail = result.stderr?.trim() || result.stdout?.trim() || 'Docker returned no details.';
  console.error(`${prefix}: ${detail}`);
}

function printRecoveryInstructions(reason) {
  console.error(`Docker network ${NETWORK_NAME} is not safe to reuse: ${reason}`);
  console.error('Stop Supabase and recreate the network manually:');
  for (const command of RECOVERY_COMMANDS) {
    console.error(`  ${command}`);
  }
}

function inspectNetwork() {
  const inspect = runDocker(['network', 'inspect', NETWORK_NAME]);

  if (inspect.error) {
    console.error(`Unable to run Docker: ${inspect.error.message}`);
    process.exit(1);
  }

  return inspect;
}

const inspect = inspectNetwork();

if (inspect.status === 0) {
  const validation = validateNetworkInspection(inspect.stdout);

  if (!validation.ok) {
    printRecoveryInstructions(validation.reason);
    process.exit(1);
  }

  console.log(
    `Verified Docker network ${NETWORK_NAME}: driver ${NETWORK_DRIVER}, ports bound to localhost.`,
  );
  process.exit(0);
}

if (!isMissingNetworkError(inspect.stderr)) {
  printDockerFailure(`Unable to inspect Docker network ${NETWORK_NAME}`, inspect);
  process.exit(inspect.status ?? 1);
}

const create = runDocker([
  'network',
  'create',
  '--driver',
  NETWORK_DRIVER,
  '--opt',
  BIND_OPTION,
  NETWORK_NAME,
]);

if (create.error) {
  console.error(`Unable to run Docker: ${create.error.message}`);
  process.exit(1);
}

if (create.status !== 0) {
  printDockerFailure(`Unable to create Docker network ${NETWORK_NAME}`, create);
  process.exit(create.status ?? 1);
}

const verification = inspectNetwork();

if (verification.status !== 0) {
  printDockerFailure(`Unable to verify Docker network ${NETWORK_NAME}`, verification);
  process.exit(verification.status ?? 1);
}

const validation = validateNetworkInspection(verification.stdout);

if (!validation.ok) {
  printRecoveryInstructions(validation.reason);
  process.exit(1);
}

console.log(
  `Created and verified Docker network ${NETWORK_NAME}: driver ${NETWORK_DRIVER}, ports bound to localhost.`,
);
