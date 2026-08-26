import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const uiPath = 'src/app/adminCampaignRoster.ts';
let ui = readFileSync(uiPath, 'utf8');
const guard = `  if (!shell || !summary || !logout) {\n    throw new Error('Missing administrative shell for MAP-054.');\n  }\n\n`;
const guardIndex = ui.indexOf(guard);
if (guardIndex < 0) throw new Error('MAP-054 admin shell guard not found');
const tailIndex = guardIndex + guard.length;
const head = ui.slice(0, tailIndex);
const tail = ui.slice(tailIndex).replaceAll('shell.', 'adminShell.');
ui = `${head}  const adminShell: HTMLElement = shell;\n\n${tail}`;
writeFileSync(uiPath, ui);
rmSync('src/app/adminShellContract.d.ts', { force: true });

execFileSync(
  process.platform === 'win32' ? 'node_modules/.bin/prettier.cmd' : 'node_modules/.bin/prettier',
  [
    '--write',
    'src/app/adminCampaignRoster.ts',
    'src/application/adminCampaignRosterController.test.ts',
  ],
  { stdio: 'inherit' },
);

mkdirSync('test-results', { recursive: true });
execFileSync(
  'tar',
  [
    '-czf',
    'test-results/MAP-054-format-diagnostic.png',
    'src/app/adminCampaignRoster.ts',
    'src/application/adminCampaignRosterController.test.ts',
  ],
  { stdio: 'inherit' },
);

execFileSync('git', ['diff', '--exit-code'], { stdio: 'inherit' });
