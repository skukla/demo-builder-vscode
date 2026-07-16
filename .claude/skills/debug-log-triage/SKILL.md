---
name: debug-log-triage
description: Triage a pasted "Demo Builder Debug Logs" dump — find the real failure, read the structured stdout/stderr block that carries the truth, strip known-benign noise, and map channels to owning features. Use whenever the user pastes extension logs, asks "what went wrong?", or a live test fails with an unclear error.
---

# Debug-Log Triage

Parse a Demo Builder debug-log dump to the actual failure fast. The logs mix three things:
the real signal, verbose-but-healthy progress, and **alarming-looking lines that are benign
by design**. Knowing which is which is the whole skill.

## When NOT to use
- The user reports a UI symptom with no logs → ask for the Debug Logs channel dump first
  ("Demo Builder: Debug Logs" output channel; there's also a quieter "User Logs" channel).
- Jest/test output → that's not extension logging; read the test failure directly.
- You need to ADD logging → `src/core/logging/` (StepLogger templates in
  `src/core/logging/config/logging.json`), not this skill.

## Log anatomy
- Format: `timestamp [level] [Channel] message`. `[debug]`-prefixed lines are the debug tier
  of the dual-channel logger; `[warning]`/`[error]` levels come from VS Code.
- **Multi-line JSON blocks belong to the line ABOVE them** — a `[debug] { "stdout": ..., "stderr": ... }`
  block is the structured dump for the preceding message. This matters (see Procedure step 1).
- Channel → owning feature (the common ones):
  `[Prerequisites]`→features/prerequisites · `[Auth]/[Token]/[Auth SDK]/[Entity Fetcher]/[Adobe Setup]/[Context Resolver]/[Org Validator]`→features/authentication ·
  `[Mesh Deployment]/[Mesh Setup]/[Mesh Subscribe]`→features/mesh + project-creation/services/meshSetupService ·
  `[EDS]/[Storefront Setup]/[EdsPipeline]/[Helix]/[DA.live*]/[ConfigService]/[Block Collection]/[CodePatch]`→features/eds ·
  `[Project Creation]`→project-creation/handlers/executor.ts · `[ComponentManager]`→features/components ·
  `[GitHub*]`→features/eds github services · `[MCP]`→features/ai/server · `[Updates]`→features/updates.

## Procedure
1. **Find the first `[error]` and read the `[debug] {...}` JSON dump immediately BEFORE it.**
   The error formatter sometimes surfaces a blank `Error:` — the preceding structured dump's
   `stdout`/`stderr` fields carry the actionable line the formatter dropped. The CLI's own
   words ("Selected org, project and workspace already has a mesh") beat the wrapper every time.
2. **Match the failure-signatures table** below before theorizing.
3. **Strip the benign noise** (table below) so it doesn't derail the diagnosis.
4. **Map the channel to the owning feature** to locate code; message templates live in
   `src/core/logging/config/logging.json`.
5. **Scan timestamp gaps** — a multi-second gap with no lines is a stall (CLI call, network);
   correlate with the last-started operation, and remember Adobe CLI ops routinely succeed
   AFTER a timeout fires (check stdout for success indicators before trusting a timeout error).

## Failure signatures (signature → root cause → next step)
| Signature | Root cause | Next step |
|---|---|---|
| `already has a mesh` in stdout + `No existing mesh, using create strategy` earlier | Create-vs-update keys off PROJECT state (`meshDeployment.ts:116` `existingMeshId`) — empty for a new project even when the reused workspace already carries a mesh | Immediate: fresh workspace. Fix: backlog `2026-07-15-mesh-create-vs-update-remote-probe.md` |
| `[error] Error:` with NOTHING after it | Error formatter dropped the CLI detail | Read the `[debug] {stdout,stderr}` block above it (Procedure 1); the formatter gap is part of the same backlog item |
| `DA.live token expired or missing` / `Token validation failed: Token has expired` | DA.live tokens are short-lived; the token-first flow re-prompts | Expected once per session-ish; only a LOOP of these is a bug |
| `Could not find numeric ID for project "X", using name as fallback` | Console project lacks/eludes numeric-id resolution | Works via fallback; note it, don't chase it unless an op then 403s |
| `[Command Executor] Process exited with code N` followed by a raw stderr | The actual CLI failure | Judge by the stderr content, not the exit code alone |

## Benign-noise catalog (looks alarming, is by design)
| Line | Why it's fine |
|---|---|
| `Process exited with code 128 after ~20ms` right before `Detected version from package.json` | `git describe` on a tagless repo — version detection falls back by design |
| `[GitHub App] Code status ...: 400, installed: true` | 400 IS the expected probe response proving the app is installed |
| `[ConfigService] PUT ... -> 409: Site configuration already exists` then `updating...` | Normal exists→delete→re-register flow |
| `Skipping directory without manifest: .claude` | The projects-dir scanner skipping the AI-config folder, by design |
| `[DA.live] List API unavailable, falling back to content index` | Designed fallback path |
| `[Updates] Skipping auto-check; last ran Ns ago` | Debounce, not a failure |
| `[Env Setup] Extension not found, cannot read infrastructure config` | Fallback path during prerequisite checks in the Dev Host |

## Verify
1. Your diagnosis names a specific signature or code path — not "something failed."
2. The stdout/stderr from the structured dump appears in your explanation (the CLI's own words).
3. Anything you dismissed as benign is in the catalog above; if you dismissed something NOT
   in the catalog, verify it in code first, then ADD it to the catalog.

_If this skill was wrong or incomplete, fix it before closing the task._
