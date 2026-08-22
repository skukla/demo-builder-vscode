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
   **Read `stdout` even when `stderr` looks like the answer.** `aio` puts its real diagnosis in
   stdout and a generic "check your configuration" in stderr, so the field that looks like the
   error is the one that misleads: "Unable to create a mesh. Check the mesh configuration file"
   (stderr) vs "The specified organization, project, and workspace combination is invalid or
   disabled" (stdout, same failure). Two days were spent on the wrong half of that dump.
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
| `already has a mesh` then `retrying as update` | Create-vs-update keyed off project state; the one-shot create→update fallback (shipped 2026-07-15) self-heals it | Benign when followed by a successful update; only a failure AFTER the retry is a real error |
| `Unable to update. No mesh found for Org(...)` then `retrying as create` | Stored meshId pointed at a mesh deleted out-of-band (the inverse case); the one-shot update→create fallback (shipped 2026-07-16) self-heals it | Benign when followed by a successful create (note: the mesh ENDPOINT changes; config.json re-syncs in Phase 5). A failure after the retry is real |
| Either mesh signature with NO `retrying as` line | Running a pre-fallback build | Update the extension / rebuild from develop |
| `[error] Error:` with NOTHING after it | Error formatter dropped the CLI detail | Read the `[debug] {stdout,stderr}` block above it (Procedure 1); the formatter gap is part of the same backlog item |
| `DA.live token expired or missing` / `Token validation failed: Token has expired` | DA.live tokens are short-lived; the token-first flow re-prompts | Expected once per session-ish; only a LOOP of these is a bug |
| `The specified organization, project, and workspace combination is invalid or disabled` in **stdout**, under a `Selected project: <name>` banner, while stderr blames the mesh config | An `aio` call ran WITHOUT `withOrgContext`, so it used the CLI's process-global `aio console where` selection — stale by design, since Phase 4a stopped writing it | Read the `Selected project:` name in stdout. If it is not the project's committed destination, the call path is unwrapped: wrap it in `withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg))` like its siblings. **Tell:** a `[Mesh Subscribe]`/SDK step SUCCEEDS in the same run while the CLI step fails — the SDK path threads ids explicitly, so only the CLI half mis-targets (`deployMeshHeadless`, fixed 2026-08-03) |
| `The CLI's persisted project "X" is not in this token's project list` (debug) | `aio console where` names a project that is deleted or under an org this token cannot reach — expected, since the extension no longer writes that global | Genuinely benign for the resolver, which now returns "no current project". But treat it as a WARNING SIGN for the run: if an `aio` op fails nearby, suspect an unwrapped call path targeting that same stale project (the row above). Before 2026-08-03 this read `Could not find numeric ID … using name as fallback` and this table called it harmless — the fallback fabricated an id and that mis-targeting was the mesh bug |
| A webview shows `undefined`/`[object Object]`/a Promise, a blank value, or acts on a field the extension log shows it never received (or vice versa) | A message channel whose payload crosses untyped — sender and receiver disagree by convention (the brandName/componentSecretFlags class) | This IS the trigger the untyped-channels item waits for: fix the bug, then type THAT channel end-to-end per `.rptc/backlog/2026-08-21-webview-push-channels-are-untyped.md` (one channel per slice; worked examples inside). Do not fix the field without typing the channel — that leaves the door open for the next field |
| `[Command Executor] Process exited with code N` followed by a raw stderr | The actual CLI failure | Judge by the stderr content, not the exit code alone |
| `Error: Build failed (exit N): …` under `[Mesh Deployment]`/`[Updates]` | A component's `npm run build` failed | Read the `[debug] … Build failed {code,stdout,stderr}` dump immediately ABOVE it. **If there is no dump, the build ran on a pre-2026-08-18 build** — the message was all there was, and it was worthless (see next row) |
| `Error: Build failed: <path>/` and NOTHING else, no dump above it | The evidence was destroyed in three steps, not missing | `buildComponent` folded multi-line output into the Error MESSAGE; `sanitizeErrorForLogging` keeps only `split('\n')[0]`; the path redactor then eats that line whole. Node prints the offending FILE PATH as line 1 of any uncaught exception, so the reason is erased every time. Fixed by dumping stdout/stderr before throwing — **ask the user to re-run on ≥ beta.134 and re-send the log**; do not theorise from the old one |

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
| `[Command Executor] Process exited with code N` immediately followed by `[Retry Strategy] Command succeeded` | Not a contradiction. Commands run with `reject: false`, so a non-zero exit does not throw and "succeeded" means only *the process ran to completion* (`retryStrategyManager.ts:154`). Callers check `.code` themselves. Judge the step by what the CALLER did next, never by this line |
| A step with NO `[Command Executor] Process exited` line at all | Only NON-ZERO exits are logged (`commandExecutor.ts:415`), so silence there means exit 0. Useful in reverse: a `[Retry Strategy] Command succeeded` with no exit line above it really did succeed |

## Verify
1. Your diagnosis names a specific signature or code path — not "something failed."
2. The stdout/stderr from the structured dump appears in your explanation (the CLI's own words).
3. Anything you dismissed as benign is in the catalog above; if you dismissed something NOT
   in the catalog, verify it in code first, then ADD it to the catalog.

_If this skill was wrong or incomplete, fix it before closing the task._
