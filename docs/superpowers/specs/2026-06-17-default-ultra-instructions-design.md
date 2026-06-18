# Default ultra instructions for installer-written always-on agent surfaces

## Summary

When caveman is installed into an agent's always-on instruction path, the instruction should tell that agent to start in **`ultra`** mode by default until the user switches modes or turns caveman off. Today the actual runtime default is already `ultra` in the hook/config path, but several installer-written instruction surfaces still use generic "respond terse" wording, and the OpenClaw bootstrap explicitly says the default intensity is `full`.

The fix is to align every caveman-owned always-on instruction source with one rule: **if the caveman skills are installed, default to `ultra`**. This is an instruction-content change, not a behavior-engine change. Existing mode switching, repo/user config overrides, and disable commands remain untouched.

## Problem

The current repo has multiple installer-written always-on instruction sources:

1. `src/rules/caveman-activate.md` for repo rule files such as Cursor, Windsurf, Cline, Copilot, opencode repo instructions, and generic `AGENTS.md`
2. The embedded fallback copy of that same rule in `src/tools/caveman-init.js`
3. `src/rules/caveman-openclaw-bootstrap.md` for OpenClaw's injected `SOUL.md` block
4. The embedded fallback copy of the OpenClaw bootstrap in `bin/lib/openclaw.js`

These sources do not currently tell the same story about the default mode. Some only describe caveman style in general. OpenClaw explicitly says `full`. That makes always-on installs inconsistent across agents and weakens the "installed = ultra by default" contract the product now wants.

## Goals

1. Make every installer-written always-on instruction surface state that caveman starts in `ultra` by default when installed.
2. Preserve all existing opt-out and mode-switch controls.
3. Keep all fallback copies byte-aligned with their source-of-truth text so standalone installer paths stay correct.
4. Minimize scope to instruction and doc alignment only.

## Non-goals

1. Change hook/config/runtime mode resolution logic in `src/hooks/caveman-config.js`
2. Change slash-command parsing or natural-language enable/disable behavior
3. Change boundaries for code, commits, reviews, or Auto-Clarity behavior
4. Add a new configuration system or template engine unless the current files make that necessary during implementation

## Root cause

The repo's runtime default and its written always-on instructions drifted apart.

- Runtime default resolution already falls through to `ultra`.
- Installer-written rule files still use older generic wording.
- OpenClaw bootstrap still hard-codes `full`.
- Two standalone fallback copies must be kept in sync manually, which makes drift easier.

Because different agent surfaces read different instruction text, a user can install caveman successfully and still present a different default expectation depending on the agent.

## Proposed design

### 1. Make the shared always-on rule explicitly default to ultra

Update `src/rules/caveman-activate.md` so it says the agent should use **`ultra` by default when the caveman skills are installed**. The wording should still keep the existing controls nearby:

- switch with `/caveman lite|full|ultra|supra|silence`
- disable with `"stop caveman"` or `"normal mode"`
- preserve Auto-Clarity and boundaries

This single source fans out to repo-local rule files and any installer paths that read this file directly.

### 2. Keep the init fallback copy identical in meaning

Update the embedded `RULE_BODY` in `src/tools/caveman-init.js` to match the new `src/rules/caveman-activate.md` wording. That preserves correct behavior for standalone or fallback init flows where the source file is not available on disk.

### 3. Bring OpenClaw into parity

Update `src/rules/caveman-openclaw-bootstrap.md` so the bootstrap says the default intensity is `ultra`, not `full`, and explicitly ties that default to caveman being installed in the workspace.

Then update the fallback snippet in `bin/lib/openclaw.js` to match the source file exactly in meaning. OpenClaw is the one current always-on surface with a clearly contradictory default, so parity here is mandatory.

### 4. Let dependent instruction surfaces inherit automatically

No new installation path is needed for:

- repo `AGENTS.md`
- `.opencode/AGENTS.md`
- `.github/copilot-instructions.md`
- Cursor/Windsurf/Cline rule files

These already inherit from `src/rules/caveman-activate.md` through `src/tools/caveman-init.js` or installer flows. Once the shared rule text changes, these surfaces should follow automatically.

### 5. Sync user-facing docs where they currently promise a different default

Update directly related documentation where users are told what the default is for always-on installs, especially any place still saying or implying `full` for OpenClaw or generic always-on instruction surfaces. Documentation should match the shipped instruction text after the patch.

## Data and control flow

1. User installs caveman with hooks, `--with-init`, OpenClaw support, or another caveman-owned always-on surface.
2. Installer writes a caveman rule or bootstrap block from the repo source or an embedded fallback.
3. That written instruction now tells the agent to start in `ultra` by default when caveman is installed.
4. User can still switch modes with `/caveman ...` or disable caveman with normal off commands.
5. Runtime config/env/repo overrides continue to win where they already apply.

## Affected files

Expected implementation scope:

- `src/rules/caveman-activate.md`
- `src/tools/caveman-init.js`
- `src/rules/caveman-openclaw-bootstrap.md`
- `bin/lib/openclaw.js`
- directly related docs such as `INSTALL.md` and/or `README.md` if their wording currently conflicts

## Testing

Validate the smallest existing checks that cover the changed behavior:

1. Any existing installer or hook tests that snapshot or assert rule/bootstrap text should be updated and run.
2. If there is no focused automated coverage for these text surfaces, use targeted verification of the written sources and their embedded fallback copies to ensure parity.
3. Confirm the changed docs and instruction sources all say `ultra` consistently for always-on installed behavior.

## Risks and mitigations

### Risk: wording drift between source files and fallback copies

Mitigation: change each source and its embedded fallback in the same patch and verify the wording stays aligned.

### Risk: accidentally changing runtime behavior instead of instruction text

Mitigation: leave `src/hooks/caveman-config.js`, mode tracking, and command parsing untouched unless a verification step proves they are directly implicated.

### Risk: docs still contradict shipped behavior

Mitigation: update only the directly related user-facing docs in the same patch so the promise matches the install result.

## Recommendation

Implement the all-surfaces wording alignment now. It is the smallest change that fully satisfies the request, fixes the OpenClaw contradiction, and keeps every caveman-owned always-on install path telling coding agents to use `ultra` by default as long as the skills are installed.
