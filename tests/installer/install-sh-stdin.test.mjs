import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALL_SH = path.resolve(HERE, '..', '..', 'install.sh');

test('curl-pipe install.sh does not leak script body to npx stdin', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-install-sh-stdin-'));
  const fakeBin = path.join(tmp, 'bin');
  const stdinPath = path.join(tmp, 'stdin.txt');
  const argsPath = path.join(tmp, 'args.txt');
  fs.mkdirSync(fakeBin, { recursive: true });

  fs.writeFileSync(
    path.join(fakeBin, 'npx'),
    `#!/usr/bin/env bash
printf '%s\n' "$*" > ${JSON.stringify(argsPath)}
cat > ${JSON.stringify(stdinPath)}
`,
    { mode: 0o755 }
  );

  const script = fs.readFileSync(INSTALL_SH, 'utf8');
  const r = spawnSync('bash', ['-s'], {
    cwd: tmp,
    input: script,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
  });

  assert.equal(r.status, 0);
  assert.equal(fs.readFileSync(argsPath, 'utf8').trim(), '-y github:Karnonson/caveman');
  assert.equal(fs.readFileSync(stdinPath, 'utf8'), '');
});
