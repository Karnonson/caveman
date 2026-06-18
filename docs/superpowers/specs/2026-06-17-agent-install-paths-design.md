# Agent-specific installer paths for TUI-selected targets

## Summary

The installer TUI should keep its current selection UX, but the selected agent must install caveman into that agent's native location under caveman's control. Today most non-plugin agents still route through `npx skills add`, so the final filesystem target depends on upstream behavior. This causes wrong-path installs such as choosing Copilot and getting `.agents/skills` instead of `.github/skills`.

The fix is to add a caveman-owned install strategy registry. The TUI and provider list stay intact. What changes is the execution layer: for agents with known native skill directories, caveman copies its bundled skills directly into the correct target path; for agents that truly require a third-party installer, caveman keeps the current path. The universal `.agents/skills` installer remains explicit fallback behavior, not a side effect of selecting another agent.

## Problem

`bin/install.js` currently treats many providers as `installViaSkills()`, which shells out to:

`npx -y skills add Karnonson/caveman --skill * -a <profile> --yes`

That means caveman no longer controls the final install target for those agents. If upstream profile handling changes, is incomplete, or falls back generically, the caveman installer can report success while writing into the wrong location. Copilot is the visible failure now, but the same class of bug exists for any agent whose intended native skill path differs from the generic `.agents/skills` layout.

## Goals

1. Preserve the current interactive chooser and `--only` UX.
2. Ensure a selected agent installs only into that agent's intended native target.
3. Stop accidental leakage into `.agents/skills` unless the user explicitly selected `universal` or the installer reached the true unknown-agent fallback.
4. Make agent target rules live in caveman's codebase, with tests, instead of depending on upstream `skills add` behavior.

## Non-goals

1. Rebuild Claude, Gemini, opencode, or OpenClaw installers, which already use caveman-owned flows.
2. Change `--with-init` semantics for always-on repo rules.
3. Remove support for upstream installs where no confirmed native target exists yet.

## Root cause

The chooser correctly records the selected provider IDs. The bug happens after selection: the generic `installViaSkills()` path delegates target resolution to an external tool. Caveman therefore loses control of the selected agent's destination folder. The universal `.agents/skills` path is safe only when chosen on purpose, but today the external tool can effectively recreate that generic outcome for other agents.

## Proposed design

### 1. Add an install-strategy layer to the provider model

Extend provider definitions so execution is chosen by strategy, not by the presence of `profile`.

Example conceptual shape:

```js
{
  id: 'copilot',
  label: 'GitHub Copilot',
  detect: '...',
  install: {
    kind: 'native-skill-dir',
    targets: ['.github/skills']
  }
}
```

Supported strategy kinds:

1. `plugin` / existing native handlers for Claude, Gemini, opencode, OpenClaw
2. `native-skill-dir` for agents with confirmed folder destinations
3. `upstream-skills-cli` for agents that still need `npx skills add`
4. `universal-skill-dir` for explicit `.agents/skills`

This removes the current overloaded meaning of `profile`.

### 2. Introduce a direct skill-copy installer for folder-based agents

Create a shared helper in `bin/install.js` that copies the bundled skill directories into an agent-specific destination, similar to `installUniversal()`, but parameterized by destination path.

Behavior:

1. Create the target directory.
2. Copy the same bundled skill set used by universal installs.
3. In dry-run mode, print the exact destination.
4. Record success/failure under the selected provider ID.

Copilot uses this helper with `.github/skills`.

### 3. Separate explicit universal fallback from named agent installs

The universal installer remains available in two cases only:

1. User explicitly chose `universal`
2. No known selected provider actually matched and fallback is required

Selecting `copilot` or any other mapped native-folder agent must never call universal logic and must never write into `.agents/skills`.

### 4. Expand to other agents through a target registry

During implementation, audit supported agents and move each one into `native-skill-dir` only when its target path is confirmed. This gives a safe migration path:

1. Copilot is mandatory in this change.
2. Any other agent with a verified native skill folder should move in the same patch.
3. Unverified agents stay on `upstream-skills-cli` until their path is confirmed.

This satisfies the request to improve behavior for other agents too without guessing paths.

## Data and control flow

1. User opens TUI and selects one or more agents.
2. `opts.only` receives those IDs exactly as it does today.
3. Main install loop dispatches by provider install strategy.
4. Native-folder strategies copy bundled skills into the mapped folder.
5. Upstream-only strategies still shell out.
6. Universal fallback triggers only when no selected known strategy handled the request.

## Testing

Add or update installer tests to cover:

1. `--only copilot --non-interactive` dry-run prints `.github/skills` and does not mention `npx -y skills add`
2. Real run for `--only copilot` creates `.github/skills/<skill>/SKILL.md`
3. Copilot path does not create `.agents/skills`
4. Universal still creates `.agents/skills`
5. Existing TUI contract remains unchanged: chooser still gates installs on confirmation
6. Any additional native-folder agents added in the patch get equivalent destination assertions

## Risks and mitigations

### Risk: wrong native path mapping

Mitigation: only migrate agents whose target folder is confirmed during implementation; leave the rest on the current upstream flow.

### Risk: behavior drift between universal and native copies

Mitigation: reuse the same bundled skill directory list and shared recursive copy helper.

### Risk: docs drift

Mitigation: update install docs only for agents whose effective install command or behavior changes.

## Recommendation

Implement the strategy-registry approach now, starting with Copilot and any other agents whose target directories can be verified during the patch. This fixes the current bug at the root, keeps the TUI stable, and creates a maintainable path away from third-party destination resolution.
