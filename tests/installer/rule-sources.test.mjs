import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const requireCjs = createRequire(import.meta.url);

const INIT = requireCjs(path.join(REPO_ROOT, 'src', 'tools', 'caveman-init.js'));
const OPENCLAW = requireCjs(path.join(REPO_ROOT, 'bin', 'lib', 'openclaw.js'));

function normalize(src) {
  return src.replace(/\r\n/g, '\n').trimEnd() + '\n';
}

test('caveman-init RULE_BODY stays synced with caveman-activate source', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'src', 'rules', 'caveman-activate.md'), 'utf8');
  assert.equal(normalize(INIT.RULE_BODY), normalize(src));
});

test('openclaw bootstrap snippet stays synced with source and defaults to ultra', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'src', 'rules', 'caveman-openclaw-bootstrap.md'), 'utf8');
  const snippet = OPENCLAW.loadBootstrapSnippet();

  assert.match(normalize(src), /Default intensity: `ultra`/);
  assert.doesNotMatch(normalize(src), /Default intensity: `full`/);
  assert.match(normalize(snippet), /Default intensity: `ultra`/);
  assert.doesNotMatch(normalize(snippet), /Default intensity: `full`/);
  assert.equal(normalize(snippet), normalize(src));
});
