import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER = path.resolve(HERE, '..', '..', 'bin', 'install.js');

function freshTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cm-universal-'));
}

test('dry-run --only universal plans direct .agents/skills copy without skills CLI', () => {
  const cwd = freshTmpDir();
  const r = spawnSync('node', [INSTALLER, '--dry-run', '--only', 'universal', '--non-interactive'], {
    cwd,
    encoding: 'utf8',
  });

  assert.equal(r.status, 0);
  assert.match(r.stdout, /Generic \.agents\/skills detected/);
  assert.match(r.stdout, /would mkdir .*\/\.agents\/skills/);
  assert.match(r.stdout, /would copy 7 skill dirs into .*\/\.agents\/skills/);
  assert.doesNotMatch(r.stdout, /npx -y skills add/);
});

test('--only universal copies skills into .agents/skills without cloning', () => {
  const cwd = freshTmpDir();
  const r = spawnSync('node', [INSTALLER, '--only', 'universal', '--non-interactive'], {
    cwd,
    encoding: 'utf8',
  });

  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, '.agents', 'skills', 'caveman', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(cwd, '.agents', 'skills', 'cavecrew', 'SKILL.md')), true);
  assert.doesNotMatch(r.stdout, /Cloning repository/);
  assert.doesNotMatch(r.stdout, /npx -y skills add/);
});
