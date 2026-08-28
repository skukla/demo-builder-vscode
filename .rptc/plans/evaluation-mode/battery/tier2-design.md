# Tier-2 harness design — scratch-project writes (AI-1q)

Written 2026-08-27 by the prompt-coverage loop, at the design gate. The dev
host was dead (post-merge reload never came back), so NOTHING here could be
live-verified — which is exactly why this is a design, not an implementation.
Implement only in a session with a live host.

## What this is

The battery's tier 2: writes safe on a disposable resource. Today the
generated read-only allowlist makes every write attempt INVALID by design;
tier 2 needs (a) a scratch project to aim writes at, (b) a per-run allowlist
extension for declared tier-2 tools, (c) restore discipline so a run leaves
the owner's world untouched.

## The model (design-gate answers)

- **What is it**: rig infrastructure in the battery directory — a `--tier2`
  mode on `run.mjs` plus a `tier2-writes.txt` hand-curated list. Not a new
  entity in the extension's data model; the scratch project is an ordinary
  project directory the extension already understands.
- **What owns it**: the battery (`.rptc/plans/evaluation-mode/battery/`).
  The allowlist extension follows the EXISTING pattern split: generated
  enumeration for reads + a hand-triaged supplement file (the
  `third-party-reads.txt` precedent), because write-safety is a judgment no
  annotation can carry.
- **Alternatives rejected**:
  - *Annotate tier-2-safety on the tools themselves* — rejected: safety here
    is contextual (export_project_settings is safe ONLY against a scratch
    project), and a per-tool annotation cannot say "safe against scratch".
  - *A separate tier-2 runner* — rejected: run.mjs already owns snapshot/
    restore (the memory-dir precedent at its top), prompt selection, and
    scoring; a sibling runner is the parallel-implementation smell.

## The safety findings that shaped it (each verified by reading the handler)

1. **`export_project_settings` exports SECRETS** (`createExportSettings(…,
   true)` in settingsTransferService.ts — "always include secrets for local
   export"). It acts on the CURRENT project. If a tier-2 run executes it
   while the owner's real project is current, real credentials land in a
   file at an agent-chosen path. Therefore: **the harness itself flips the
   current project to scratch BEFORE any agent runs, via the probe — never
   as an agent step** — and restores it after, even on abort (trap).
2. **Confirm-gated tools are excluded from tier 2 entirely** (delete_ai_prompt,
   set_console_apis, …): headless `-p` has no elicitation channel, so consent
   falls to a VS Code modal nobody is watching — the exact anti-pattern the
   consent work exists to prevent.
3. **The select_* trio stays deferred** (see tier1-queue.json): their
   readOnlyHint is a deliberate, commented decision (adobeTools.ts: "session
   targeting only… no safety gain"), and the battery's isolation complaint is
   also valid. Owner decision queued; the harness must not resolve it by
   side effect.

## First conservative write set (each needs its handler read AT IMPLEMENTATION
time — this list is candidates, not clearance)

| Tool | Why it qualifies | Restore step |
|---|---|---|
| `save_ai_prompt` (unpinned) | writes the scratch project's manifest | scratch reset |
| `export_project_settings` | writes one local file, scratch-scoped by the current-project flip | delete the export |
| `set_project_pinned` | globalState flag on the scratch project | unset via the same tool |
| `rename_project` | folder move inside the scratch dir | rename back / scratch reset |
| `update_project_config` | **READ ITS HANDLER FIRST** — if it triggers regeneration that publishes, it is tier 3, full stop | scratch reset |

## The scratch project

Create `~/.demo-builder/projects/battery-scratch/` by LOADING a real manifest
(bodea's) and stripping to a minimal no-cloud shape — never hand-invent the
shape (the repo's never-write-a-shape-you-have-not-read rule; the
`componentInstances`-record trap is documented in webview-test-authoring §5).
Reset = rewrite from the fixture before each run. The fixture is committed so
runs are comparable.

## Run choreography

```
snapshot: current-project pointer (read via probe get_current_project)
flip:     set_current_project → battery-scratch (probe, NOT agent)
run:      tier-2 prompts with ALLOWED + tier2-writes.txt
restore:  set_current_project → saved pointer; scratch reset; verify via probe
```

Abort-safe: restore runs in a finally. A run that cannot verify restore
REPORTS it in red at the top of the results — a harness that silently leaves
the owner's pointer on scratch is worse than no harness.

## Acceptance (when implemented)

- A planted non-listed write in a prompt's expect ABORTS the run (extends the
  existing unanswerable-prompt guard).
- With the harness live: a full tier-2 batch leaves `git status` clean in the
  repo, the owner's current project restored, and no file outside
  battery-scratch/ modified (assert by directory mtime sweep).
