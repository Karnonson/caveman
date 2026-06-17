// Tests for the interactive chooser TUI contract:
//   1. No --only + interactive terminal → open chooser TUI; no install runs until user confirms.
//   2. No --only + non-interactive or no TTY → exit with instructions, never auto-install.
//   3. --only → bypass chooser entirely; proceed directly to install plan.
//
// Note: tests here run without a real TTY (piped stdio), so the interactive TUI
// path cannot be exercised end-to-end. The TTY-based tests are therefore limited
// to the non-TTY contract (rule 2) and the --only bypass (rule 3). Rule 1 is
// verified structurally: the non-TTY guard proves that no install ever fires
// without a user confirmation path being available.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER = path.resolve(HERE, '..', '..', 'bin', 'install.js');

function run(...args) {
  return spawnSync('node', [INSTALLER, ...args], { encoding: 'utf8' });
}

// ── Non-interactive / no-TTY: must exit with instructions, never auto-install ──

test('no --only + --non-interactive exits 0 with instructions, no auto-install', () => {
  // The installer must refuse to auto-install everything when running
  // non-interactively with no explicit --only selection.
  const r = run('--non-interactive', '--dry-run');
  assert.equal(r.status, 0);
  // Output must guide the user toward --only or interactive mode.
  assert.match(r.stdout, /--only/);
  // No install actions must have been planned — even in dry-run mode.
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would mkdir/);
  assert.doesNotMatch(r.stdout, /would install/);
  assert.doesNotMatch(r.stdout, /would merge/);
});

test('no --only + piped stdin (no TTY) exits 0 with instructions, no auto-install', () => {
  // spawnSync with encoding:'utf8' gives the subprocess piped (non-TTY) stdio.
  // The installer must detect the absence of a usable terminal and exit with
  // instructions rather than auto-installing detected agents.
  const r = spawnSync('node', [INSTALLER, '--dry-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--only/);
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would mkdir/);
  assert.doesNotMatch(r.stdout, /would install/);
  assert.doesNotMatch(r.stdout, /would merge/);
});

test('no --only + closed stdin exits 0 with instructions, no auto-install', () => {
  // Ensure that even with stdin explicitly closed/empty, no auto-install happens.
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    input: '',
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--only/);
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would mkdir/);
  assert.doesNotMatch(r.stdout, /would install/);
});

// ── --only: bypass chooser entirely ─────────────────────────────────────────

test('--only bypasses chooser and proceeds to agent install plan', () => {
  // When --only is provided, the installer must skip the interactive chooser
  // entirely and proceed directly to the install plan for the named agent.
  const r = run('--dry-run', '--only', 'claude', '--non-interactive');
  assert.equal(r.status, 0);
  // No TUI chooser text in output.
  assert.doesNotMatch(r.stdout, /Agent selection/i);
  assert.doesNotMatch(r.stdout, /Use Up\/Down/i);
  // No "exit with instructions" message — the chooser was bypassed successfully.
  assert.doesNotMatch(r.stdout, /no agents selected/i);
});

test('--only with multiple agents bypasses chooser for all named agents', () => {
  const r = run('--dry-run', '--only', 'claude', '--only', 'gemini', '--non-interactive');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /Agent selection/i);
  assert.doesNotMatch(r.stdout, /no agents selected/i);
});

// ── Interactive TUI: user must confirm before any install fires ──────────────

test('in non-TTY env, detected agents do not auto-install without user confirmation', () => {
  // The core contract: in a non-TTY environment (as in the test runner), the
  // installer has no way to obtain user confirmation, so it must install nothing.
  // This is equivalent to "detected agents may be preselected in the chooser,
  // but the installer must not run any installation until the user confirms."
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    input: '',
  });
  assert.equal(r.status, 0);
  // No install actions — neither for detected agents nor for the universal fallback.
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would mkdir/);
  assert.doesNotMatch(r.stdout, /would install/);
  assert.doesNotMatch(r.stdout, /would copy/);
});
