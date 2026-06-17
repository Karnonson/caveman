// Tests for the interactive chooser TUI contract:
//   1. No --only + interactive terminal → open chooser TUI; no install runs until user confirms.
//   2. No --only + non-interactive or no TTY → exit with instructions, never auto-install.
//   3. --only → bypass chooser entirely; proceed directly to install plan.
//
// curl|bash terminal handling (Task 2):
//   4. When stdin is piped (curl|bash) but /dev/tty is accessible, the installer must
//      open the TUI via /dev/tty rather than printing instructions immediately.
//   5. CAVEMAN_TTY_DEVICE env var overrides the terminal device path (testability hook).
//      - '' (empty) → skip /dev/tty attempt, exit with instructions.
//      - '/dev/null' (not a real TTY) → attempt, detect non-TTY, exit with instructions.
//      - '/dev/nonexistent' → attempt, open fails, exit with instructions.
//
// Note: tests here run without a real TTY (piped stdio), so the interactive TUI
// path cannot be exercised end-to-end. The TTY-based tests are therefore limited
// to the non-TTY contract (rule 2) and the --only bypass (rule 3). Rule 1 is
// verified structurally: the non-TTY guard proves that no install ever fires
// without a user confirmation path being available.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER = path.resolve(HERE, '..', '..', 'bin', 'install.js');

function run(...args) {
  return spawnSync('node', [INSTALLER, ...args], { encoding: 'utf8' });
}

/** Check whether /dev/tty is accessible as a read-write device in this process. */
function devTtyAccessible() {
  try {
    const fd = fs.openSync('/dev/tty', 'r+');
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
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
  // CAVEMAN_TTY_DEVICE='' disables the /dev/tty fallback so this test stays
  // non-interactive even in terminal environments (prevents hanging after Task 2 impl).
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, CAVEMAN_TTY_DEVICE: '' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--only/);
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would mkdir/);
  assert.doesNotMatch(r.stdout, /would install/);
  assert.doesNotMatch(r.stdout, /would merge/);
});

test('no --only + closed stdin exits 0 with instructions, no auto-install', () => {
  // Ensure that even with stdin explicitly closed/empty, no auto-install happens.
  // CAVEMAN_TTY_DEVICE='' disables the /dev/tty fallback (prevents hanging in terminals).
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    input: '',
    env: { ...process.env, CAVEMAN_TTY_DEVICE: '' },
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

// ── Explicit work (--with-init / --all) must survive the no-selection guard ──

test('--with-init without --only still runs per-repo init in non-interactive mode', () => {
  // Regression guard: the no-selection guard must NOT swallow --with-init.
  // Even when no agents are selected, per-repo init must still be attempted.
  const r = run('--dry-run', '--non-interactive', '--with-init');
  assert.equal(r.status, 0);
  // Per-repo init must have been attempted (dry-run prints "would run:" for the
  // caveman-init.js call, or "would download" when running without a local clone).
  assert.match(r.stdout, /writing per-repo IDE rule files|would run:.*caveman-init|would download/i);
  // No agent installs must have fired.
  assert.doesNotMatch(r.stdout, /would merge.*settings/i);
  assert.doesNotMatch(r.stdout, /would run:.*plugin/i);
});

test('--all without --only still runs per-repo init in non-interactive mode', () => {
  // --all sets withInit = true; must behave identically to --with-init alone.
  const r = run('--dry-run', '--non-interactive', '--all');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /writing per-repo IDE rule files|would run:.*caveman-init|would download/i);
  assert.doesNotMatch(r.stdout, /would merge.*settings/i);
});

// ── Interactive TUI: user must confirm before any install fires ──────────────

test('in non-TTY env, detected agents do not auto-install without user confirmation', () => {
  // The core contract: in a non-TTY environment (as in the test runner), the
  // installer has no way to obtain user confirmation, so it must install nothing.
  // CAVEMAN_TTY_DEVICE='' disables the /dev/tty fallback (prevents hanging in terminals).
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    input: '',
    env: { ...process.env, CAVEMAN_TTY_DEVICE: '' },
  });
  assert.equal(r.status, 0);
  // No install actions — neither for detected agents nor for the universal fallback.
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would mkdir/);
  assert.doesNotMatch(r.stdout, /would install/);
  assert.doesNotMatch(r.stdout, /would copy/);
});

// ── curl|bash: /dev/tty terminal device fallback (Task 2) ───────────────────

test('CAVEMAN_TTY_DEVICE="" (empty) → skip /dev/tty attempt, exit with instructions', () => {
  // When CAVEMAN_TTY_DEVICE is explicitly empty, the installer must NOT attempt
  // to open any terminal device and must fall straight to instructions.
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, CAVEMAN_TTY_DEVICE: '' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--only/);
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would install/);
});

test('CAVEMAN_TTY_DEVICE=/dev/null (openable, not a real TTY) → exits with instructions', () => {
  // The installer must open the device, detect it is not a real TTY (setRawMode
  // unavailable), and fall back to instructions without crashing.
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, CAVEMAN_TTY_DEVICE: '/dev/null' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--only/);
  assert.doesNotMatch(r.stdout, /would run:/);
  assert.doesNotMatch(r.stdout, /would install/);
});

test('CAVEMAN_TTY_DEVICE=/dev/nonexistent-caveman (open fails) → exits with instructions', () => {
  // The installer must catch the ENOENT/ENXIO from openSync and fall back to
  // instructions without crashing.
  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, CAVEMAN_TTY_DEVICE: '/dev/nonexistent-caveman' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--only/);
  assert.doesNotMatch(r.stdout, /would run:/);
});

test('piped stdin with /dev/tty accessible → TUI opens (not instructions)', (t) => {
  // THIS IS THE PRIMARY FAILING TEST before Task 2 implementation.
  //
  // Precondition: /dev/tty must be accessible (skip in headless/CI environments).
  // Before implementation: installer checks process.stdin.isTTY → false → prints instructions
  //                        immediately (exits status=0, stdout contains /--only/).
  // After implementation:  installer opens /dev/tty, renders TUI, blocks waiting for input.
  //                        The process does NOT immediately exit with instructions.
  //
  // We verify by:
  //   1. Running without CAVEMAN_TTY_DEVICE override so real /dev/tty is used.
  //   2. Giving the process 1500 ms to respond.
  //   3. If it exits status=0 with instructions in that window → TUI was not opened → FAIL.
  //   4. If it times out (status=null) or does not print instructions → TUI was opened → PASS.
  if (!devTtyAccessible()) {
    t.skip('/dev/tty not accessible in this environment — skipping (headless/CI)');
    return;
  }

  const r = spawnSync('node', [INSTALLER, '--dry-run'], {
    encoding: 'utf8',
    timeout: 1500,
    // No CAVEMAN_TTY_DEVICE override — must use real /dev/tty.
    // stdout/stderr are piped (default for spawnSync) so stdin is not a TTY.
  });

  if (r.status === 0 && /--only/.test(r.stdout)) {
    assert.fail(
      'Installer printed instructions immediately (stdin.isTTY path) instead of ' +
      'opening TUI via /dev/tty. Expected: TUI to open and block (process times out). ' +
      'Got: immediate exit with instructions — /dev/tty was NOT used.'
    );
  }
  // Process timed out (status=null) or exited without printing instructions → TUI ran. ✓
});
